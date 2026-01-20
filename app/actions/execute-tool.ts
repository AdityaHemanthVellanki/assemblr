"use server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeToolAction } from "@/lib/toolos/runtime";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";

export async function runToolExecution(toolId: string, actionId: string, input: Record<string, any>) {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    // 1. Fetch Tool Spec
    const { data: tool, error } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !tool || !tool.spec) {
      throw new Error("Tool not found or has no spec");
    }

    let spec = tool.spec;
    let compiledTool: unknown = null;
    if (tool.active_version_id) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec, compiled_tool")
        .eq("id", tool.active_version_id)
        .single();
      spec = version?.tool_spec ?? spec;
      compiledTool = version?.compiled_tool ?? null;
    }
    if (!isToolSystemSpec(spec)) {
      throw new Error("I need a few details before I can finish building this tool.");
    }
    if (!isCompiledToolArtifact(compiledTool)) {
      throw new Error("CompiledTool not found for active version.");
    }
    const result = await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      compiledTool,
      actionId,
      input,
      userId: ctx.userId,
    });
    return { success: true, result };
  } catch (err) {
    console.error("Tool execution failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown execution error",
    };
  }
}
