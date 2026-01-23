"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExecutionResult } from "@/lib/execution/types";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { executeToolAction as executeToolSystemAction } from "@/lib/toolos/runtime";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { materializeToolOutput, getLatestToolResult, FatalInvariantViolation } from "@/lib/toolos/materialization";
import { finalizeToolLifecycle } from "@/lib/toolos/lifecycle";

export async function executeToolAction(
  toolId: string,
  actionId: string,
  args: Record<string, any>,
  versionId?: string,
): Promise<ExecutionResult> {
  await ensureCorePluginsLoaded();
  const supabase = await createSupabaseServerClient();
  const tracer = new ExecutionTracer("run");

  let finalStatus: "READY" | "FAILED" = "FAILED";
    let finalError: string | null = null;
    let finalEnvironment: any = null;

    try {
    let spec: unknown;
    let compiledTool: unknown = null;
    let orgId: string | undefined;

    if (versionId) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec, compiled_tool, status, tool_id")
        .eq("id", versionId)
        .single();
      if (!version) throw new Error("Version not found");
      spec = version.tool_spec;
      compiledTool = version.compiled_tool ?? null;
      const { data: project } = await supabase
        .from("projects")
        .select("org_id")
        .eq("id", version.tool_id)
        .single();
      orgId = project?.org_id;
    } else {
      const { data: project } = await (supabase.from("projects") as any)
        .select("spec, org_id, active_version_id")
        .eq("id", toolId)
        .single();
      if (!project || !project.spec) {
        throw new Error("Tool not found");
      }
      orgId = project.org_id;
      if (project.active_version_id) {
        const { data: version } = await (supabase.from("tool_versions") as any)
          .select("tool_spec, compiled_tool")
          .eq("id", project.active_version_id)
          .single();
        spec = version?.tool_spec ?? project.spec;
        compiledTool = version?.compiled_tool ?? null;
      } else {
        spec = project.spec;
      }
    }

    if (!orgId) throw new Error("Organization not found");
    if (!isToolSystemSpec(spec)) {
      throw new Error("I need a few details before I can finish building this tool.");
    }
    if (!isCompiledToolArtifact(compiledTool)) {
      throw new Error("CompiledTool not found for active version.");
    }

    const result = await executeToolSystemAction({
      orgId,
      toolId,
      compiledTool,
      actionId,
      input: args,
    });

    // Materialize the output
    const action = (spec as any).actions.find((a: any) => a.id === actionId);
    if (action) {
      const previousResult = await getLatestToolResult(toolId, orgId);
      console.log("[ToolRuntime] Runtime completed");
      
      const matResult = await materializeToolOutput({
        toolId,
        orgId,
        spec: spec as any,
        actionOutputs: [{ action, output: result.output }],
        previousRecords: previousResult?.records_json ?? null,
      });

      // ADD A HARD INVARIANT (REQUIRED)
      if (matResult.status !== "MATERIALIZED") {
         finalStatus = "FAILED";
         finalError = "Tool execution completed but environment was never finalized";
         throw new FatalInvariantViolation(
           "Tool execution completed but environment was never finalized"
         );
      }
      
      finalStatus = "READY";
      finalEnvironment = matResult.environment;
    } else {
       // If no action found, is it success? Assuming yes for now, but usually action is required.
       // If we got here, execution finished.
       finalStatus = "READY";
    }

    tracer.finish("success");

    return {
      viewId: "action_exec",
      status: "success",
      rows: Array.isArray(result.output) ? result.output : [result.output],
      timestamp: new Date().toISOString(),
      source: "live_api",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    tracer.finish("failure", msg);
    
    finalStatus = "FAILED";
    finalError = msg;

    return {
      viewId: "action_exec",
      status: "error",
      error: msg,
      rows: [],
      timestamp: new Date().toISOString(),
      source: "live_api",
    };
  } finally {
    try {
      await finalizeToolLifecycle({
        toolId,
        status: finalStatus,
        errorMessage: finalError,
        environment: finalEnvironment,
        lifecycle_done: true
      });
    } catch (finalizeError) {
      console.error("[ToolLifecycle] Failed to finalize tool", finalizeError);
    }
  }
}
