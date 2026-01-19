"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExecutionResult } from "@/lib/execution/types";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { isCompiledTool } from "@/lib/compiler/ToolCompiler";

export async function executeToolAction(
  toolId: string,
  actionId: string,
  args: Record<string, any>,
  versionId?: string,
): Promise<ExecutionResult> {
  await ensureCorePluginsLoaded();
  const supabase = await createSupabaseServerClient();
  const tracer = new ExecutionTracer("run");

  try {
    let spec: unknown;
    let orgId: string | undefined;

    if (versionId) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("mini_app_spec, status, tool_id")
        .eq("id", versionId)
        .single();
      if (!version) throw new Error("Version not found");
      spec = version.mini_app_spec;
      const { data: project } = await supabase
        .from("projects")
        .select("org_id")
        .eq("id", version.tool_id)
        .single();
      orgId = project?.org_id;
    } else {
      const { data: project } = await supabase
        .from("projects")
        .select("spec, org_id")
        .eq("id", toolId)
        .single();
      if (!project || !project.spec) {
        throw new Error("Tool not found");
      }
      spec = project.spec;
      orgId = project.org_id;
    }

    if (!orgId) throw new Error("Organization not found");
    if (!isCompiledTool(spec)) {
      throw new Error("Tool is not compiled");
    }

    const registry = new RuntimeActionRegistry(orgId);
    registry.registerAll(spec.runtime.actions);
    const result = await registry.execute(actionId, args);

    tracer.finish("success");

    return {
      viewId: "action_exec",
      status: "success",
      rows: Array.isArray(result) ? result : [result],
      timestamp: new Date().toISOString(),
      source: "live_api",
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
      source: "live_api",
    };
  }
}
