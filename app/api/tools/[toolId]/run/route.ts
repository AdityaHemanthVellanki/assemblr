import { NextResponse } from "next/server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";
import { loadToolState } from "@/lib/toolos/state-store";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  const supabase = await createSupabaseServerClient();

  const { data: project, error } = await (supabase.from("projects") as any)
    .select("spec, active_version_id")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !project?.spec) {
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
    return NextResponse.json(
      { error: "I need a few details before I can finish building this tool." },
      { status: 422 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const actionId = typeof body?.actionId === "string" ? body.actionId : null;
  const viewId = typeof body?.viewId === "string" ? body.viewId : null;
  const input = body?.input && typeof body.input === "object" ? body.input : {};

  const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
  const evidence = await loadMemory({
    scope,
    namespace: "tool_builder",
    key: "data_evidence",
  });

  if (actionId) {
    const result = await executeToolAction({
      orgId: ctx.orgId,
      toolId,
      spec,
      actionId,
      input,
      userId: ctx.userId,
    });
    if (viewId) {
      const view = renderView(spec, result.state, viewId);
      return NextResponse.json({
        view,
        state: result.state,
        events: result.events,
        evidence: evidence ?? null,
      });
    }
    return NextResponse.json({ state: result.state, output: result.output, events: result.events, evidence: evidence ?? null });
  }

  const state = await loadToolState(toolId, ctx.orgId);
  if (viewId) {
    const view = renderView(spec, state, viewId);
    return NextResponse.json({ view, state, evidence: evidence ?? null });
  }

  return NextResponse.json({ state, evidence: evidence ?? null });
}
