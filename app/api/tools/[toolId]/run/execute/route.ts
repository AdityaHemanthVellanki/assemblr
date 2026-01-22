import { requireOrgMember } from "@/lib/auth/permissions.server";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec, type ToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { FatalInvariantViolation } from "@/lib/core/errors";
import { materializeToolOutput, getLatestToolResult } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    // Use Admin Client for execution to ensure access to all needed data
    const supabase = createSupabaseAdminClient();

    const { data: project, error } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !project?.spec) {
      return errorResponse("Tool not found", 404);
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

    const latestResult = await getLatestToolResult(toolId, ctx.orgId);
    if (!latestResult && (project.status === "active" || (spec as any)?.status === "active")) {
      throw new FatalInvariantViolation("ACTIVE tool without materialized result");
    }

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
      const action = spec.actions.find((entry) => entry.id === actionId);
      if (!action) {
        return errorResponse("Action not found", 404);
      }
      const result = await executeToolAction({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        actionId,
        input,
        userId: ctx.userId,
      });
      
      let recordsToUse = latestResult?.records_json as any ?? null;
      let stateToUse = recordsToUse?.state ?? {};

      if (action.type === "READ") {
        const matResult = await materializeToolOutput({
           toolId,
           orgId: ctx.orgId,
           actionOutputs: [{ action, output: result.output }],
           spec: spec,
           previousRecords: recordsToUse
        });
        
        // Fetch the fresh result to ensure we have the latest state (merged)
        // Or we can rely on materializeToolOutput to return it? 
        // materializeToolOutput returns status/count/id, not full records.
        // But we can reconstruct it or fetch it.
        // For performance, let's fetch it or trust that buildSnapshotRecords logic is consistent.
        // We'll fetch it to be safe and authoritative.
        const freshResult = await getLatestToolResult(toolId, ctx.orgId);
        recordsToUse = freshResult?.records_json;
        stateToUse = recordsToUse?.state ?? {};
      }

      if (viewId) {
        const view = renderView(spec, stateToUse, viewId);
        return jsonResponse({
          view,
          state: stateToUse,
          events: result.events,
          evidence: evidence ?? null,
        });
      }
      return jsonResponse({
        state: stateToUse,
        output: result.output,
        events: result.events,
        evidence: evidence ?? null,
      });
    }

    // View Rendering (Read Only)
    if (!latestResult) {
      return errorResponse("No materialized result", 422, { status: "failed", reason: "No materialized result" });
    }
    const snapshotState = (latestResult.records_json as any)?.state ?? {};
    const snapshotSchema = (latestResult.schema_json as any);
    if (snapshotSchema) {
      spec = { ...spec, entities: snapshotSchema };
    }

    if (viewId) {
      const view = renderView(spec, snapshotState, viewId);
      return jsonResponse({ view, state: snapshotState, evidence: evidence ?? null });
    }

    return jsonResponse({ state: snapshotState, evidence: evidence ?? null });
  } catch (e) {
    return handleApiError(e);
  }
}
