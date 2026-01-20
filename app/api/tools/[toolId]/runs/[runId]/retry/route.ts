import { NextResponse } from "next/server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { executeToolAction } from "@/lib/toolos/runtime";
import { runWorkflow } from "@/lib/toolos/workflow-engine";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; runId: string }> },
) {
  const { toolId, runId } = await params;
  const { ctx } = await requireOrgMember();
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
        action: "Activate the tool before retrying runs",
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
      actionId: run.action_id,
      input: run.input ?? {},
      userId: ctx.userId,
      triggerId: `retry:${run.id}`,
    });
    return NextResponse.json({ status: "retry_started" });
  }

  if (run.workflow_id) {
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
      workflowId: run.workflow_id,
      input: run.input ?? {},
      triggerId: `retry:${run.id}`,
    });
    return NextResponse.json({ status: "retry_started" });
  }

  return NextResponse.json({ error: "No action or workflow to retry" }, { status: 400 });
}
