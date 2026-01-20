"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ExecutionResult } from "@/lib/execution/types";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { ensureCorePluginsLoaded } from "@/lib/core/plugins/loader";
import { executeToolAction as executeToolSystemAction } from "@/lib/toolos/runtime";
import { isToolSystemSpec } from "@/lib/toolos/spec";

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
        .select("tool_spec, status, tool_id")
        .eq("id", versionId)
        .single();
      if (!version) throw new Error("Version not found");
      spec = version.tool_spec;
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
          .select("tool_spec")
          .eq("id", project.active_version_id)
          .single();
        spec = version?.tool_spec ?? project.spec;
      } else {
        spec = project.spec;
      }
    }

    if (!orgId) throw new Error("Organization not found");
    if (!isToolSystemSpec(spec)) {
      throw new Error("Tool is not a system spec");
    }

    const result = await executeToolSystemAction({
      orgId,
      toolId,
      spec,
      actionId,
      input: args,
    });

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
