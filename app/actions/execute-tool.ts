"use server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeToolAction } from "@/lib/toolos/runtime";
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
    if (tool.active_version_id) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec")
        .eq("id", tool.active_version_id)
        .single();
      spec = version?.tool_spec ?? spec;
    }
    if (!isToolSystemSpec(spec)) {
      throw new Error("Tool is not a system spec");
    }
    const result = await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      spec,
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
