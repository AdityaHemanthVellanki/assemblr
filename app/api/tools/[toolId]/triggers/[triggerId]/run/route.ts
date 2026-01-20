import { NextResponse } from "next/server";

import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
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
    .select("spec, active_version_id")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!project?.spec) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }

  let spec = project.spec;
  if (project.active_version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec")
      .eq("id", project.active_version_id)
      .single();
    spec = version?.tool_spec ?? spec;
  }

  if (!isToolSystemSpec(spec)) {
    return NextResponse.json({ error: "Tool spec invalid" }, { status: 422 });
  }

  const trigger = spec.triggers.find((t) => t.id === triggerId);
  if (!trigger) {
    return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
  }

  if (trigger.actionId) {
    await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      spec,
      actionId: trigger.actionId,
      input: trigger.condition ?? {},
      userId: ctx.userId,
      triggerId: trigger.id,
    });
    return NextResponse.json({ status: "started" });
  }

  if (trigger.workflowId) {
    await runWorkflow({
      orgId: ctx.orgId,
      toolId,
      spec,
      workflowId: trigger.workflowId,
      input: trigger.condition ?? {},
      triggerId: trigger.id,
    });
    return NextResponse.json({ status: "started" });
  }

  return NextResponse.json({ error: "Trigger has no action or workflow" }, { status: 400 });
}
