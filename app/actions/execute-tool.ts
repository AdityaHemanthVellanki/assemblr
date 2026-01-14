"use server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { executeDashboard } from "@/lib/execution/engine";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardSpec } from "@/lib/spec/dashboardSpec";

export async function runToolExecution(toolId: string) {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    // 1. Fetch Tool Spec
    const { data: tool, error } = await supabase
      .from("projects")
      .select("spec")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !tool || !tool.spec) {
      throw new Error("Tool not found or has no spec");
    }

    const spec = tool.spec as unknown as DashboardSpec;

    // 2. Execute
    const results = await executeDashboard(ctx.orgId, spec);

    return { success: true, results };
  } catch (err) {
    console.error("Tool execution failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown execution error",
    };
  }
}
