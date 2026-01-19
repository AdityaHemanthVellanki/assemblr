import { NextResponse } from "next/server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { isCompiledTool, runCompiledTool } from "@/lib/compiler/ToolCompiler";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  const supabase = await createSupabaseServerClient();

  const { data: project, error } = await supabase
    .from("projects")
    .select("spec")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !project?.spec) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }

  const spec = project.spec;
  if (!isCompiledTool(spec)) {
    return NextResponse.json(
      { error: "Tool is not compiled" },
      { status: 422 },
    );
  }

  const registry = new RuntimeActionRegistry(ctx.orgId);
  const state = await runCompiledTool({ tool: spec, registry });

  return NextResponse.json({
    toolId: spec.toolId,
    name: spec.name,
    description: spec.description,
    ui: spec.ui,
    state,
  });
}
