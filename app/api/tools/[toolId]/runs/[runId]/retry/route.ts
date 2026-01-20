import { NextResponse } from "next/server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { isToolSystemSpec } from "@/lib/toolos/spec";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; runId: string }> },
) {
  const { toolId, runId } = await params;
  const { ctx } = await requireOrgMember();
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

  const { data: run } = await (supabase.from("execution_runs") as any)
    .select("*")
    .eq("id", runId)
    .eq("tool_id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.action_id) {
    await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      spec,
      actionId: run.action_id,
      input: run.input ?? {},
      userId: ctx.userId,
      triggerId: `retry:${run.id}`,
    });
    return NextResponse.json({ status: "retry_started" });
  }

  if (run.workflow_id) {
    await runWorkflow({
      orgId: ctx.orgId,
      toolId,
      spec,
      workflowId: run.workflow_id,
      input: run.input ?? {},
      triggerId: `retry:${run.id}`,
    });
    return NextResponse.json({ status: "retry_started" });
  }

  return NextResponse.json({ error: "No action or workflow to retry" }, { status: 400 });
}
