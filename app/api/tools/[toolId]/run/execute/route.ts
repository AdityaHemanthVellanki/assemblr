import { requireOrgMember } from "@/lib/auth/permissions.server";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCompiledToolArtifact, isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec, type ToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView, buildDefaultViewSpec } from "@/lib/toolos/view-renderer";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { FatalInvariantViolation } from "@/lib/core/errors";
import { materializeToolOutput, getLatestToolResult } from "@/lib/toolos/materialization";
import { finalizeToolExecution } from "@/lib/toolos/lifecycle";
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
      .select("spec, active_version_id, status")
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

    const compiledArtifact = isCompiledToolArtifact(compiledTool)
      ? compiledTool
      : buildCompiledToolArtifact(spec as ToolSystemSpec);

    const body = await req.json().catch(() => ({}));
    const actionId = typeof body?.actionId === "string" ? body.actionId : null;
    const viewId = typeof body?.viewId === "string" ? body.viewId : null;
    const input = body?.input && typeof body.input === "object" ? body.input : {};

    const latestResult = await getLatestToolResult(toolId, ctx.orgId);
    if (!latestResult && (project.status === "READY" || (spec as any)?.status === "active")) {
      // Allow execution if we are running an action (bootstrapping)
      if (!actionId) {
         throw new FatalInvariantViolation("READY tool without materialized result");
      }
    }

    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
    const evidence = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "data_evidence",
    });

    if (actionId) {
      // DEADMAN TIMEOUT: Force fail if execution hangs
      const DEADMAN_TIMEOUT_MS = 60000;
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Tool execution deadlocked: data_ready never set")), DEADMAN_TIMEOUT_MS);
      });

      // Execute Action with Timeout Race
      const executionPromise = (async () => {
        // Resolve Action Definition
        let action: any = null;
        action = compiledArtifact.actions.find((a) => a.id === actionId);
        if (!action) {
            throw new Error(`Action ${actionId} not found in spec`);
        }

        const result = await executeToolAction({
          orgId: ctx.orgId,
          toolId,
          compiledTool: compiledArtifact,
          actionId,
          input,
          userId: ctx.userId,
        });
        
        let recordsToUse = latestResult?.records_json as any ?? null;
        let stateToUse = recordsToUse?.state ?? {};

        // Only materialize and finalize on READ (Integration Fetch) actions
        // or if it's the first run (no records yet)
        const isRead = action.type === "READ" || action.type === "read";
        
        if (isRead) {
          console.log("[FINALIZE] All integrations completed for tool", toolId);
          const matResult = await materializeToolOutput({
             toolId,
             orgId: ctx.orgId,
             actionOutputs: [{ action, output: result.output }],
             spec: spec,
             previousRecords: recordsToUse
          });
          
          if (matResult.status === "MATERIALIZED") {
               const dataSnapshot = matResult.environment?.records ?? {};
               const viewSpec = buildDefaultViewSpec(dataSnapshot);
               
               // CALL SINGLE FINALIZATION FUNCTION
               await finalizeToolExecution({
                 toolId,
                 status: "READY",
                 data_snapshot: dataSnapshot,
                 view_spec: viewSpec,
                 environment: matResult.environment,
               });
               
               recordsToUse = matResult.environment?.records;
          } else {
               await finalizeToolExecution({
                 toolId,
                 status: "FAILED",
                 errorMessage: "Materialization failed",
                 view_ready: false,
                 data_ready: false,
               });
               throw new Error("Tool execution completed but environment was never finalized");
          }
          
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
      })();

      return await Promise.race([executionPromise, timeoutPromise]) as Response;
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
