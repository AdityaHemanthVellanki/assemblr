import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { compileToolSystem } from "@/lib/toolos/compiler";
import { ToolSystemSpec, StateReducer } from "@/lib/toolos/spec";
import { loadToolState, saveToolState } from "@/lib/toolos/state-store";
import { loadMemory, saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
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
  const toolScope: MemoryScope = { type: "tool_org", toolId, orgId };
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
    const startedAt = new Date().toISOString();
    runLogs.push({
      id: `${action.id}:start`,
      timestamp: startedAt,
      status: "running",
      actionId: action.id,
      integrationId: action.integrationId,
      capabilityId: action.capabilityId,
      input: sanitizeLogData(input),
      retries: 0,
    });
    await updateExecutionRun({ runId: run.id, status: "running", currentStep: action.id, logs: runLogs });
  }

  let output: any;
  try {
    const startedAt = Date.now();
    const token = await getValidAccessToken(orgId, action.integrationId);
    const context = await runtime.resolveContext(token);
    if (runtime.checkPermissions) {
      runtime.checkPermissions(action.capabilityId, DEV_PERMISSIONS);
    }
    const tracer = new ExecutionTracer("run");
    output = await executor.execute(input, context, tracer);
    if (run) {
      const durationMs = Date.now() - startedAt;
      runLogs.push({
        id: `${action.id}:done`,
        timestamp: new Date().toISOString(),
        status: "done",
        actionId: action.id,
        integrationId: action.integrationId,
        capabilityId: action.capabilityId,
        durationMs,
        output: summarizeOutput(output),
      });
      await updateExecutionRun({ runId: run.id, status: "completed", currentStep: action.id, logs: runLogs });
    }
  } catch (err) {
    if (run) {
      const durationMs = runLogs.length ? Date.now() - Date.parse(runLogs[0].timestamp) : undefined;
      runLogs.push({
        id: `${action.id}:failed`,
        timestamp: new Date().toISOString(),
        status: "failed",
        actionId: action.id,
        integrationId: action.integrationId,
        capabilityId: action.capabilityId,
        durationMs,
        error: err instanceof Error ? err.message : "error",
      });
      await updateExecutionRun({ runId: run.id, status: "failed", currentStep: action.id, logs: runLogs });
    }
    throw err;
  }

  const state = await loadToolState(toolId, orgId);
  const nextState = applyReducer(spec.state.reducers, action.reducerId, state, output);
  await saveToolState(toolId, orgId, nextState);
  const snapshots = (await loadMemory({
    scope: toolScope,
    namespace: "tool_builder",
    key: "state_snapshots",
  })) as Array<{ timestamp: string; state: Record<string, any> }> | null;
  const nextSnapshots = Array.isArray(snapshots) ? snapshots.slice(-4) : [];
  nextSnapshots.push({ timestamp: new Date().toISOString(), state: nextState });
  await saveMemory({
    scope: toolScope,
    namespace: "tool_builder",
    key: "state_snapshots",
    value: nextSnapshots,
  });
  await saveMemory({
    scope: toolScope,
    namespace: spec.memory.tool.namespace,
    key: actionId,
    value: output,
  });
  if (userId) {
    await saveMemory({
      scope: { type: "tool_user", toolId, userId },
      namespace: spec.memory.user.namespace,
      key: actionId,
      value: output,
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
  const record = (await loadMemory({
    scope: { type: "tool_org", toolId: params.toolId, orgId: params.orgId },
    namespace: "tool_builder",
    key,
  })) as { windowStart: number; count: number } | null;
  const current = record ?? { windowStart: now, count: 0 };
  const windowStart = now - current.windowStart > windowMs ? now : current.windowStart;
  const count = now - current.windowStart > windowMs ? 0 : current.count;
  if (count >= params.maxPerMinute) {
    throw new Error(`Rate limit exceeded for ${params.integrationId}`);
  }
  await saveMemory({
    scope: { type: "tool_org", toolId: params.toolId, orgId: params.orgId },
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

function sanitizeLogData(value: any, depth = 0): any {
  if (depth > 3) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? value.slice(0, 500) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeLogData(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      if (shouldRedactKey(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeLogData(val, depth + 1);
    }
    return out;
  }
  return String(value);
}

function shouldRedactKey(key: string) {
  const lower = key.toLowerCase();
  return (
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("password") ||
    lower.includes("authorization") ||
    lower.includes("api_key")
  );
}

function summarizeOutput(output: any) {
  if (Array.isArray(output)) {
    const sample = output.slice(0, 3).map((item) => sanitizeLogData(item));
    return { type: "array", count: output.length, sample };
  }
  if (typeof output === "object" && output !== null) {
    const keys = Object.keys(output);
    return { type: "object", keys, sample: sanitizeLogData(output) };
  }
  return sanitizeLogData(output);
}
