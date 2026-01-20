import { NextResponse } from "next/server";

import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; triggerId: string }> },
) {
  const { toolId, triggerId } = await params;
  const { ctx } = await requireOrgMember();
  await requireProjectOrgAccess(ctx, toolId);
  const supabase = await createSupabaseServerClient();

  const { data: project } = await (supabase.from("projects") as any)
    .select("spec, active_version_id, is_activated")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!project?.spec) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }
  if (!project.is_activated) {
    return NextResponse.json(
      {
        status: "blocked",
        reason: "Tool not activated",
        action: "Activate the tool before running triggers",
      },
      { status: 409 },
    );
  }

  let spec = project.spec;
  let compiledTool: unknown = null;
  if (project.active_version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec, compiled_tool")
      .eq("id", project.active_version_id)
      .single();
    spec = version?.tool_spec ?? spec;
    compiledTool = version?.compiled_tool ?? null;
  }

  if (!isToolSystemSpec(spec)) {
    return NextResponse.json({ error: "Tool spec invalid" }, { status: 422 });
  }

  const trigger = spec.triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
  }

  if (trigger.actionId) {
    if (!isCompiledToolArtifact(compiledTool)) {
      return NextResponse.json(
        {
          status: "blocked",
          reason: "CompiledTool not found for active version",
          action: "Recompile the tool to generate a CompiledTool artifact",
        },
        { status: 400 },
      );
    }
    await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      compiledTool,
      actionId: trigger.actionId,
      input: trigger.condition ?? {},
      userId: ctx.userId,
      triggerId: trigger.id,
    });
    return NextResponse.json({ status: "started" });
  }

  if (trigger.workflowId) {
    if (!isCompiledToolArtifact(compiledTool)) {
      return NextResponse.json(
        {
          status: "blocked",
          reason: "CompiledTool not found for active version",
          action: "Recompile the tool to generate a CompiledTool artifact",
        },
        { status: 400 },
      );
    }
    await runWorkflow({
      orgId: ctx.orgId,
      toolId,
      compiledTool,
      workflowId: trigger.workflowId,
      input: trigger.condition ?? {},
      triggerId: trigger.id,
    });
    return NextResponse.json({ status: "started" });
  }

  return NextResponse.json({ error: "Trigger has no action or workflow" }, { status: 400 });
}
