import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { compileToolSystem } from "@/lib/toolos/compiler";
import { ToolSystemSpec, StateReducer } from "@/lib/toolos/spec";
import { loadToolState, saveToolState } from "@/lib/toolos/state-store";
import { loadToolMemory, saveToolMemory } from "@/lib/toolos/memory-store";
import { createExecutionRun, updateExecutionRun } from "@/lib/toolos/execution-runs";

export type ToolExecutionResult = {
  state: Record<string, any>;
  output: any;
  events: Array<{ type: string; payload: any }>;
};

export async function executeToolAction(params: {
  orgId: string;
  toolId: string;
  spec: ToolSystemSpec;
  actionId: string;
  input: Record<string, any>;
  userId?: string | null;
  triggerId?: string | null;
  recordRun?: boolean;
}) {
  const { orgId, toolId, spec, actionId, input, userId, triggerId, recordRun = true } = params;
  const compiled = compileToolSystem(spec);
  const action = compiled.actions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }
  if (action.requiresApproval && input.approved !== true) {
    throw new Error(`Action ${actionId} requires approval`);
  }

  const runtime = RUNTIMES[action.integrationId];
  if (!runtime) {
    throw new Error(`Runtime not found for integration ${action.integrationId}`);
  }
  await enforceRateLimit({
    orgId,
    toolId,
    integrationId: action.integrationId,
    maxPerMinute: 60,
  });
  const executor = runtime.capabilities[action.capabilityId];
  if (!executor) {
    throw new Error(`Capability ${action.capabilityId} not found for ${action.integrationId}`);
  }

  const snapshot = recordRun ? await loadToolState(toolId, orgId) : null;
  const run = recordRun
    ? await createExecutionRun({
        orgId,
        toolId,
        triggerId: triggerId ?? "manual",
        actionId: action.id,
        input,
        stateSnapshot: snapshot ?? {},
      })
    : null;
  const runLogs: Array<Record<string, any>> = [];
  if (run) {
    runLogs.push({
      timestamp: new Date().toISOString(),
      status: "pending",
      message: `Executing ${action.id}`,
    });
    await updateExecutionRun({ runId: run.id, status: "running", currentStep: action.id, logs: runLogs });
  }

  let output: any;
  try {
    const token = await getValidAccessToken(orgId, action.integrationId);
    const context = await runtime.resolveContext(token);
    if (runtime.checkPermissions) {
      runtime.checkPermissions(action.capabilityId, DEV_PERMISSIONS);
    }
    const tracer = new ExecutionTracer("run");
    output = await executor.execute(input, context, tracer);
    if (run) {
      runLogs.push({
        timestamp: new Date().toISOString(),
        status: "done",
        message: `Completed ${action.id}`,
      });
      await updateExecutionRun({ runId: run.id, status: "completed", currentStep: action.id, logs: runLogs });
    }
  } catch (err) {
    if (run) {
      runLogs.push({
        timestamp: new Date().toISOString(),
        status: "failed",
        message: `Failed ${action.id}: ${err instanceof Error ? err.message : "error"}`,
      });
      await updateExecutionRun({ runId: run.id, status: "failed", currentStep: action.id, logs: runLogs });
    }
    throw err;
  }

  const state = await loadToolState(toolId, orgId);
  const nextState = applyReducer(spec.state.reducers, action.reducerId, state, output);
  await saveToolState(toolId, orgId, nextState);
  const snapshots = (await loadToolMemory({
    toolId,
    orgId,
    namespace: "tool_builder",
    key: "state_snapshots",
  })) as Array<{ timestamp: string; state: Record<string, any> }> | null;
  const nextSnapshots = Array.isArray(snapshots) ? snapshots.slice(-4) : [];
  nextSnapshots.push({ timestamp: new Date().toISOString(), state: nextState });
  await saveToolMemory({
    toolId,
    orgId,
    namespace: "tool_builder",
    key: "state_snapshots",
    value: nextSnapshots,
  });
  await saveToolMemory({
    toolId,
    orgId,
    namespace: spec.memory.tool.namespace,
    key: actionId,
    value: output,
  });
  if (userId) {
    await saveToolMemory({
      toolId,
      orgId,
      namespace: spec.memory.user.namespace,
      key: actionId,
      value: output,
      userId,
    });
  }

  const events = action.emits?.map((type) => ({ type, payload: { actionId, output } })) ?? [];
  return { state: nextState, output, events } satisfies ToolExecutionResult;
}

async function enforceRateLimit(params: {
  orgId: string;
  toolId: string;
  integrationId: string;
  maxPerMinute: number;
}) {
  const key = `rate_limit.${params.integrationId}`;
  const now = Date.now();
  const windowMs = 60_000;
  const record = (await loadToolMemory({
    toolId: params.toolId,
    orgId: params.orgId,
    namespace: "tool_builder",
    key,
  })) as { windowStart: number; count: number } | null;
  const current = record ?? { windowStart: now, count: 0 };
  const windowStart = now - current.windowStart > windowMs ? now : current.windowStart;
  const count = now - current.windowStart > windowMs ? 0 : current.count;
  if (count >= params.maxPerMinute) {
    throw new Error(`Rate limit exceeded for ${params.integrationId}`);
  }
  await saveToolMemory({
    toolId: params.toolId,
    orgId: params.orgId,
    namespace: "tool_builder",
    key,
    value: { windowStart, count: count + 1 },
  });
}

function applyReducer(
  reducers: StateReducer[],
  reducerId: string | undefined,
  state: Record<string, any>,
  output: any,
) {
  if (!reducerId) return state;
  const reducer = reducers.find((r) => r.id === reducerId);
  if (!reducer) {
    throw new Error(`Reducer ${reducerId} not found`);
  }
  if (reducer.type === "set") {
    return { ...state, [reducer.target]: output };
  }
  if (reducer.type === "merge") {
    return { ...state, [reducer.target]: { ...(state[reducer.target] ?? {}), ...(output ?? {}) } };
  }
  if (reducer.type === "append") {
    const current = Array.isArray(state[reducer.target]) ? state[reducer.target] : [];
    const next = Array.isArray(output) ? output : [output];
    return { ...state, [reducer.target]: [...current, ...next] };
  }
  if (reducer.type === "remove") {
    const current = Array.isArray(state[reducer.target]) ? state[reducer.target] : [];
    const removeIds = new Set((Array.isArray(output) ? output : [output]).map((v) => String(v)));
    return { ...state, [reducer.target]: current.filter((item: any) => !removeIds.has(String(item?.id ?? item))) };
  }
  return state;
}
