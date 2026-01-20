import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";
import { loadToolState } from "@/lib/toolos/state-store";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { jsonResponse, errorResponse } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    const { data: project, error } = await (supabase.from("projects") as any)
      .select("spec, active_version_id, is_activated")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !project?.spec) {
      return errorResponse("Tool not found", 404);
    }

    // ENFORCEMENT: Tool must be activated
    if (!project.is_activated) {
      return errorResponse("Tool not activated yet", 409);
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
      return errorResponse("Invalid tool spec", 422);
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

    // Action Execution
    if (actionId) {
      if (!isCompiledToolArtifact(compiledTool)) {
        return errorResponse("Compiled tool artifact missing", 500);
      }
      const result = await executeToolAction({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        actionId,
        input,
        userId: ctx.userId,
      });
      if (viewId) {
        const view = renderView(spec, result.state, viewId);
        return jsonResponse({
          view,
          state: result.state,
          events: result.events,
          evidence: evidence ?? null,
        });
      }
      return jsonResponse({
        state: result.state,
        output: result.output,
        events: result.events,
        evidence: evidence ?? null,
      });
    }

    // View Rendering (Read Only)
    const state = await loadToolState(toolId, ctx.orgId);
    if (viewId) {
      const view = renderView(spec, state, viewId);
      return jsonResponse({ view, state, evidence: evidence ?? null });
    }

    return jsonResponse({ state, evidence: evidence ?? null });
  } catch (e) {
    console.error("Execute failed", e);
    return errorResponse(
      "Execution failed",
      500,
      e instanceof Error ? e.message : String(e)
    );
  }
}
