import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoMocks, ensureRuntimeOrThrow } from "@/lib/core/guard";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { ToolSystemSpecSchema, type ToolSystemSpec } from "@/lib/toolos/spec";
import { canExecuteTool, ensureToolIdentity } from "@/lib/toolos/lifecycle";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { executeToolAction } from "@/lib/toolos/runtime";
import { buildSnapshotRecords, countSnapshotRecords, materializeToolOutput } from "@/lib/toolos/materialization";
import { decideRendering, evaluateGoalSatisfaction, evaluateRelevanceGate } from "@/lib/toolos/goal-validation";
import { validateFetchedData } from "@/lib/toolos/answer-contract";
import { getCapability } from "@/lib/capabilities/registry";
import { useCases } from "@/lib/use-cases/registry";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { createToolVersion, promoteToolVersion } from "@/lib/toolos/versioning";

type ValidationResult = {
  id: string;
  name: string;
  status: "passed" | "failed";
  error?: string;
};

function buildActionInput(params: {
  action: ToolSystemSpec["actions"][number];
  spec: ToolSystemSpec;
}) {
  const plan = params.spec.query_plans.find((p) => p.actionId === params.action.id);
  const query = plan?.query ?? {};
  const input: Record<string, any> = Object.keys(query).length > 0 ? { ...query } : {};
  if (params.action.capabilityId === "google_gmail_list") {
    if (input.order_by === undefined) {
      input.order_by = params.spec.initialFetch?.order_by ?? "internalDate";
    }
    if (input.order_direction === undefined) {
      input.order_direction = params.spec.initialFetch?.order_direction ?? "desc";
    }
    if (input.maxResults === undefined) {
      input.maxResults = params.spec.initialFetch?.limit ?? 10;
    }
  }
  if (input.limit === undefined && params.spec.initialFetch?.limit) {
    input.limit = params.spec.initialFetch.limit;
  }
  return input;
}

async function validateSpec(spec: ToolSystemSpec) {
  const parsed = ToolSystemSpecSchema.safeParse(spec);
  if (!parsed.success) {
    throw new Error(`ToolSpec validation failed: ${parsed.error.issues.map((e) => e.message).join(", ")}`);
  }
  for (const action of spec.actions) {
    const cap = getCapability(action.capabilityId);
    if (!cap) {
      throw new Error(`Missing capability ${action.capabilityId} for action ${action.id}`);
    }
    if (cap.integrationId !== action.integrationId) {
      throw new Error(`Capability ${action.capabilityId} does not match integration ${action.integrationId}`);
    }
  }
}

async function finalizeToolRun(params: {
  spec: ToolSystemSpec;
  outputs: Array<{ action: ToolSystemSpec["actions"][number]; output: any }>;
  toolId: string;
  orgId: string;
}) {
  const validation = validateFetchedData(params.outputs, params.spec.answer_contract);
  const relevance = evaluateRelevanceGate({
    intentContract: params.spec.intent_contract,
    outputs: validation.outputs.map((entry) => ({ output: entry.output })),
  });
  const snapshotRecords = buildSnapshotRecords({
    spec: params.spec,
    outputs: validation.outputs,
    previous: null,
  });
  const recordCount = countSnapshotRecords(snapshotRecords);
  const dataReady = recordCount > 0;
  const goalValidation = evaluateGoalSatisfaction({
    prompt: params.spec.purpose,
    goalPlan: params.spec.goal_plan,
    intentContract: params.spec.intent_contract,
    relevance,
    hasData: dataReady,
  });
  const decision = decideRendering({ prompt: params.spec.purpose, result: goalValidation });
  const viewReady = decision.kind === "render" || dataReady;
  const viewSpec = {
    views: decision.kind === "render" ? params.spec.views : [],
    goal_plan: params.spec.goal_plan,
    intent_contract: params.spec.intent_contract,
    semantic_plan: params.spec.semantic_plan,
    goal_validation: goalValidation,
    decision,
    answer_contract: params.spec.answer_contract,
    query_plans: params.spec.query_plans,
    tool_graph: params.spec.tool_graph,
    assumptions: params.spec.clarifications,
  };

  const supabase = createSupabaseAdminClient();
  const { error: finalizeError } = await (supabase as any).rpc("finalize_tool_render_state", {
    p_tool_id: params.toolId,
    p_org_id: params.orgId,
    p_integration_data: snapshotRecords.integrations ?? {},
    p_snapshot: snapshotRecords,
    p_view_spec: viewSpec,
    p_data_ready: dataReady,
    p_view_ready: viewReady,
    p_finalized_at: new Date().toISOString(),
  });

  if (finalizeError) {
    throw new Error(`Finalize failed: ${finalizeError.message}`);
  }

  await (supabase.from("projects") as any)
    .update({
      data_snapshot: snapshotRecords,
      data_ready: dataReady,
      view_spec: viewSpec,
      view_ready: viewReady,
      status: dataReady ? "READY" : "FAILED",
      finalized_at: new Date().toISOString(),
      lifecycle_done: true,
    })
    .eq("id", params.toolId);
}

async function runUseCaseValidation(): Promise<void> {
  ensureRuntimeOrThrow();
  assertNoMocks();

  const { user, orgId } = await bootstrapRealUserSession();
  const supabase = createSupabaseAdminClient();
  const connections = await loadIntegrationConnections({ supabase, orgId });
  const connectedIntegrationIds = connections.map((c) => c.integration_id);
  if (connectedIntegrationIds.length === 0) {
    throw new Error("No active integration connections found for org. Real credentials are required.");
  }

  const results: ValidationResult[] = [];

  for (const useCase of useCases) {
    console.log(`\n--- Use Case: ${useCase.name} ---`);
    try {
      await validateSpec(useCase.spec);
      const missing = useCase.integrations.filter((id) => !connectedIntegrationIds.includes(id));
      if (missing.length > 0) {
        throw new Error(`Missing integrations: ${missing.join(", ")}`);
      }

      const { toolId } = await ensureToolIdentity({
        supabase,
        orgId,
        userId: user.id,
        name: useCase.name,
        purpose: useCase.prompt,
        sourcePrompt: useCase.prompt,
      });

      const spec = useCase.spec;
      const compiledTool = buildCompiledToolArtifact(spec);
      const version = await createToolVersion({
        orgId,
        toolId,
        userId: user.id,
        spec,
        compiledTool,
        baseSpec: null,
        supabase,
      });
      await promoteToolVersion({ toolId, versionId: version.id, supabase });
      const executionCheck = await canExecuteTool({ toolId });
      if (!executionCheck.ok) {
        throw new Error(`Tool not executable after compile (${executionCheck.reason})`);
      }
      const outputs: Array<{ action: ToolSystemSpec["actions"][number]; output: any }> = [];
      for (const action of spec.actions.filter((a) => a.type === "READ")) {
        const input = buildActionInput({ action, spec });
        const exec = await executeToolAction({
          orgId,
          toolId,
          compiledTool,
          actionId: action.id,
          input,
          userId: user.id,
        });
        outputs.push({ action, output: exec.output });
      }

      await materializeToolOutput({
        toolId,
        orgId,
        actionOutputs: outputs.map((entry) => ({ action: entry.action, output: entry.output })),
        spec,
        previousRecords: null,
      });

      await finalizeToolRun({
        spec,
        outputs,
        toolId,
        orgId,
      });

      console.log(`✅ ${useCase.name} validated`);
      results.push({ id: useCase.id, name: useCase.name, status: "passed" });
    } catch (err: any) {
      console.error(`❌ ${useCase.name} failed`, err?.message ?? err);
      results.push({
        id: useCase.id,
        name: useCase.name,
        status: "failed",
        error: err?.message ?? String(err),
      });
    }
  }

  const failed = results.filter((r) => r.status === "failed");
  if (failed.length > 0) {
    console.error("Use case validation failed", failed);
    process.exit(1);
  }
  console.log("✅ All use cases validated successfully");
}

runUseCaseValidation().catch((err) => {
  console.error("❌ Use case validation failed", err);
  process.exit(1);
});
