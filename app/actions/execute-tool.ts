"use server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { isCompiledTool, runCompiledTool } from "@/lib/compiler/ToolCompiler";

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

    const spec = tool.spec;
    if (!isCompiledTool(spec)) {
      throw new Error("Tool is not compiled");
    }

    const registry = new RuntimeActionRegistry(ctx.orgId);
    const state = await runCompiledTool({ tool: spec, registry });

    return { success: true, state };
  } catch (err) {
    console.error("Tool execution failed", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown execution error",
    };
  }
}
