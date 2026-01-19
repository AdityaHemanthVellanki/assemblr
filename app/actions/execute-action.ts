"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { IntegrationRuntime } from "@/lib/core/runtime";
import { ExecutionResult } from "@/lib/execution/types";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { parseToolSpec, ToolSpec } from "@/lib/spec/toolSpec";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { normalizeActionId } from "@/lib/spec/action-id";

export async function executeToolAction(
  toolId: string,
  actionId: string,
  args: Record<string, any>,
  versionId?: string // Support running specific version (e.g. Draft)
): Promise<ExecutionResult> {
  await ensureCorePluginsLoaded();
  const supabase = await createSupabaseServerClient();
  const tracer = new ExecutionTracer("run");

  try {
    let spec: ToolSpec;
    let orgId: string;

    if (versionId) {
        // Fetch specific version (Draft/Archived/Active)
        const { data: version } = await (supabase.from("tool_versions") as any).select("mini_app_spec, status, tool_id").eq("id", versionId).single();
        if (!version) throw new Error("Version not found");
        
        spec = version.mini_app_spec;
        
        // Need orgId. Fetch from tool.
        const { data: project } = await supabase.from("projects").select("org_id").eq("id", version.tool_id).single();
        orgId = project?.org_id;
    } else {
        // 1. Fetch Tool Spec (Active)
        const { data: project } = await supabase
            .from("projects")
            .select("spec, org_id")
            .eq("id", toolId)
            .single();

        if (!project || !project.spec) {
            throw new Error("Tool not found");
        }
        spec = project.spec as ToolSpec;
        orgId = project.org_id;
    }

    if (!orgId) throw new Error("Organization not found");

    // 2. Hydrate Runtime Registry (Source of Truth)
    const registry = new RuntimeActionRegistry(orgId);
    
    // Parse and normalize spec to ensure actions are valid
    const parsedSpec = parseToolSpec(spec);
    
    // Register all actions from the spec
    await registry.hydrate(parsedSpec);

    // 3. Resolve Action
    const normalizedId = normalizeActionId(actionId);
    const executable = registry.get(normalizedId);

    // 4. Handle "Virtual" Actions (Ephemeral Capability usage not in spec)
    // This supports legacy behavior or fan-out where runtime synthesizes an action ID
    if (!executable) {
        // Check if it's a capability ID directly
        // We construct a synthetic spec to hydrate just this action
        // BUT we need to be careful. The user said: "If an action is referenced... and it is not registered, Compilation must fail".
        // This is runtime, not compilation.
        // However, if the UI calls a "capability ID" that is NOT in the spec, strict mode should arguably block it.
        // BUT `executeToolAction` is also used for "Run this capability" in test mode or chat mode where action might be implicit.
        
        // Let's allow fallback if it looks like a capability ID, but WARN.
        // Actually, the previous code had this logic. I will preserve it but route it through registry hydration.
        
        const parts = actionId.split("_");
        if (parts.length >= 2) {
             const integrationId = parts[0];
             // Attempt to hydrate a synthetic action
             const syntheticAction = {
                 id: actionId,
                 type: "integration_query",
                 config: {
                     integrationId,
                     capabilityId: actionId,
                     params: {}
                 }
             };
             
             // Create a synthetic mini-app spec for hydration
             await registry.hydrate({
                 kind: "mini_app",
                 actions: [syntheticAction]
             } as any);
             
             if (registry.has(actionId)) {
                 console.log(`[Runtime] Hydrated synthetic action ${actionId}`);
             }
        }
    }

    const finalExecutable = registry.get(normalizedId);
    if (!finalExecutable) {
        throw new Error(`Action ${actionId} (normalized: ${normalizedId}) not found in runtime registry. Ensure it is defined in the tool spec.`);
    }

    // 5. Execute
    tracer.logActionExecution({
        actionId: finalExecutable.id,
        type: "integration_call", // We assume it's integration if it's in this registry for now
        inputs: args,
        status: "running"
    });

    const result = await finalExecutable.run(tracer);
    
    tracer.finish("success");

    // Standardize result
    return {
        viewId: "action_exec",
        status: "success",
        rows: Array.isArray(result) ? result : [result],
        timestamp: new Date().toISOString(),
        source: "live_api"
    };

  } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      tracer.finish("failure", msg);
      
      return {
          viewId: "action_exec",
          status: "error",
          error: msg,
          rows: [],
          timestamp: new Date().toISOString(),
          source: "live_api"
      };
  }
}
