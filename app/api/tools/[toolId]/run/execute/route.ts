import { requireOrgMember } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCompiledToolArtifact, isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec, type ToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";
import { validateFetchedData } from "@/lib/toolos/answer-contract";
import { evaluateGoalSatisfaction, decideRendering, buildEvidenceFromDerivedIncidents, evaluateRelevanceGate } from "@/lib/toolos/goal-validation";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { FatalInvariantViolation } from "@/lib/core/errors";

export const dynamic = "force-dynamic";
import { materializeToolOutput, getLatestToolResult, buildSnapshotRecords } from "@/lib/toolos/materialization";
import { type ViewSpecPayload } from "@/lib/toolos/spec";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    const statusSupabase = await createSupabaseServerClient();
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
        const isRead = action.type === "READ";
        
        if (isRead) {
          const matResult = await materializeToolOutput({
             toolId,
             orgId: ctx.orgId,
             actionOutputs: [{ action, output: result.output }],
             spec: spec,
             previousRecords: recordsToUse
          });
          
          if (matResult.status === "MATERIALIZED") {
               recordsToUse = matResult.environment?.records;
          } else {
               throw new Error("Tool execution completed but environment was never finalized");
          }
          
          stateToUse = recordsToUse?.state ?? {};

          const readActionIds = (spec?.actions ?? [])
            .filter((specAction: any) => specAction?.type === "READ")
            .map((specAction: any) => specAction?.id)
            .filter((id: any) => typeof id === "string");

          const actionOutputs = recordsToUse?.actions ?? {};
          const actionsComplete =
            readActionIds.length === 0 || readActionIds.every((id: string) => id in actionOutputs);

          if (actionsComplete) {
            if (!spec.answer_contract) {
              throw new Error("Answer contract required but missing");
            }

            const outputEntries = (spec?.actions ?? [])
              .filter((specAction: any) => specAction?.type === "READ")
              .map((specAction: any) => ({
                action: specAction,
                output: actionOutputs?.[specAction.id],
              }))
              .filter((entry: any) => entry.output !== undefined && entry.output !== null);

            const validation = validateFetchedData(outputEntries, spec.answer_contract);
            const successfulOutputs = validation.outputs.filter((entry) => entry.output !== null && entry.output !== undefined);
            const derivedOutput = validation.outputs.find((entry: any) => entry.action.id === "github.failure.incidents")?.output;
            const goalEvidence = Array.isArray(derivedOutput) ? buildEvidenceFromDerivedIncidents(derivedOutput) : undefined;
            const relevance = evaluateRelevanceGate({
              intentContract: spec.intent_contract,
              outputs: validation.outputs.map((entry) => ({ output: entry.output })),
            });
            const goalValidation = evaluateGoalSatisfaction({
              prompt: spec.purpose,
              goalPlan: spec.goal_plan,
              intentContract: spec.intent_contract,
              evidence: goalEvidence,
              relevance,
              hasData: successfulOutputs.length > 0,
            });
            const decision = decideRendering({ prompt: spec.purpose, result: goalValidation });

            const snapshotRecords = buildSnapshotRecords({
              spec,
              outputs: validation.outputs,
              previous: null,
            });
            const integrationData = snapshotRecords.integrations ?? {};
            
            const dataReady = successfulOutputs.length > 0;
            const viewReady = decision.kind === "render" || successfulOutputs.length > 0;
            
            if (successfulOutputs.length > 0 && !dataReady) {
               throw new Error("Invariant violated: Records exist but data_ready is false");
            }

            const finalizedAt = new Date().toISOString();
            const snapshot = snapshotRecords;
            const viewSpec: ViewSpecPayload = {
              views: decision.kind === "render" && Array.isArray(spec.views) ? spec.views : [],
              goal_plan: spec.goal_plan,
              intent_contract: spec.intent_contract,
              semantic_plan: spec.semantic_plan,
              goal_validation: goalValidation,
              decision,
              answer_contract: spec.answer_contract,
              query_plans: spec.query_plans,
              tool_graph: spec.tool_graph,
              assumptions: Array.isArray(spec.clarifications) ? spec.clarifications : undefined,
            };

            console.log("[FINALIZE] Writing flags to toolId:", toolId);
            console.error("[FINALIZE CONTEXT]", {
              toolId,
              supabaseUrl: process.env.SUPABASE_URL ?? null,
              schema: "public",
              client: "server",
            });
            let { error: finalizeError } = await (statusSupabase as any).rpc("finalize_tool_render_state", {
              p_tool_id: toolId,
              p_org_id: ctx.orgId,
              p_integration_data: integrationData,
              p_snapshot: snapshot,
              p_view_spec: viewSpec,
              p_data_ready: dataReady,
              p_view_ready: viewReady,
              p_finalized_at: finalizedAt,
            });

            if (finalizeError?.message?.includes("finalize_tool_render_state") && (finalizeError?.message?.includes("does not exist") || finalizeError?.message?.includes("Could not find the function"))) {
              const { error: upsertError } = await (statusSupabase as any)
                .from("tool_render_state")
                .upsert({
                  tool_id: toolId,
                  org_id: ctx.orgId,
                  integration_data: integrationData ?? {},
                  snapshot,
                  view_spec: viewSpec,
                  data_ready: dataReady,
                  view_ready: viewReady,
                  finalized_at: finalizedAt,
                });
              if (upsertError) {
                finalizeError = upsertError;
              } else {
                const { error: projectUpdateError } = await (statusSupabase as any)
                  .from("projects")
                  .update({
                    data_snapshot: integrationData ?? {},
                    data_ready: dataReady,
                    view_spec: viewSpec,
                    view_ready: viewReady,
                    status: dataReady ? "READY" : "FAILED",
                    finalized_at: finalizedAt,
                    lifecycle_done: true,
                  })
                  .eq("id", toolId);
                finalizeError = projectUpdateError ?? null;
              }
            }

            if (project.active_version_id) {
              await (supabase.from("tool_versions") as any)
                .update({
                  view_spec: viewSpec,
                  data_snapshot: snapshot,
                  runtime_config: (spec as any)?.runtime_config ?? null,
                })
                .eq("id", project.active_version_id);
            }

            if (finalizeError) {
              throw new Error(`Finalize transaction failed: ${finalizeError.message}`);
            }

            const { data: renderState, error: renderStateError } = await (statusSupabase as any)
              .from("tool_render_state")
              .select("tool_id, data_ready, view_ready, finalized_at")
              .eq("tool_id", toolId)
              .eq("org_id", ctx.orgId)
              .maybeSingle();

            console.error("[FINALIZE VERIFICATION]", {
              toolId,
              data: renderState ?? null,
              error: renderStateError ?? null,
              supabaseUrl: process.env.SUPABASE_URL ?? null,
            });

            if (renderStateError || !renderState) {
              throw new Error("FINALIZE CLAIMED SUCCESS BUT tool_render_state ROW DOES NOT EXIST");
            }
            if (renderState.view_ready !== viewReady) {
              throw new Error("FINALIZE CLAIMED SUCCESS BUT view_ready MISMATCH");
            }
            if (renderState.data_ready !== dataReady) {
              throw new Error("FINALIZE CLAIMED SUCCESS BUT data_ready MISMATCH");
            }

            console.log("[FINALIZE] Integrations completed AND state persisted", renderState);
          }
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
