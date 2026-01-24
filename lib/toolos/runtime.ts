import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken, IntegrationAuthError } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { CompiledToolArtifact } from "@/lib/toolos/compiler";
import { StateReducer } from "@/lib/toolos/spec";
import { loadToolState, saveToolState } from "@/lib/toolos/state-store";
import { loadMemory, saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { createExecutionRun, updateExecutionRun } from "@/lib/toolos/execution-runs";
import { requestCoordinator } from "@/lib/security/rate-limit";

export type ToolExecutionResult = {
  state: Record<string, any>;
  output: any;
  events: Array<{ type: string; payload: any }>;
};

export async function executeToolAction(params: {
  orgId: string;
  toolId: string;
  compiledTool: CompiledToolArtifact;
  actionId: string;
  input: Record<string, any>;
  userId?: string | null;
  triggerId?: string | null;
  recordRun?: boolean;
  dryRun?: boolean;
}) {
  const { orgId, toolId, compiledTool, actionId, input, userId, triggerId, recordRun = true, dryRun = false } = params;
  const toolScope: MemoryScope = { type: "tool_org", toolId, orgId };
  const action = compiledTool.actions.find((item) => item.id === actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }
  if (action.requiresApproval && input.approved !== true && !dryRun) {
    throw new Error(`Action ${actionId} requires approval`);
  }

  // Use coalesce for reads, serialized for writes?
  // Actually, requestCoordinator.run is a mutex. We might want to relax this for READ actions.
  const isRead = action.type === "READ";
  // ToolRunLock: Only ONE active run per tool per user
  const coordinationKey = `tool:${toolId}:user:${userId || "anon"}`;

  const runner = async () => {
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

    // Dry Run: Skip side effects for non-READ actions
    if (dryRun && !isRead) {
      return {
        state: {},
        output: { dryRun: true, message: "Action skipped in dry-run mode", input: sanitizeLogData(input) },
        events: []
      };
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
      console.log(`[Runtime] Action ${action.id} STARTING. Input keys: ${Object.keys(input).join(", ")}`);
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
      console.log(`[Runtime] Fetching token for ${action.integrationId}...`);
      const token = await getValidAccessToken(orgId, action.integrationId);
      const context = await runtime.resolveContext(token);
      if (runtime.checkPermissions) {
        runtime.checkPermissions(action.capabilityId, DEV_PERMISSIONS);
      }
      const tracer = new ExecutionTracer("run");
      
      console.log(`[Runtime] Executing capability ${action.capabilityId}...`);
      // EXECUTE ONCE - NO RETRY
      output = await executor.execute(input, context, tracer);

      const recordCount = Array.isArray(output) ? output.length : (output ? 1 : 0);
      console.log(`[Runtime] Action ${action.id} COMPLETED. Records: ${recordCount}`);

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
          output: sanitizeLogData(output),
        });
        await updateExecutionRun({ runId: run.id, status: "completed", logs: runLogs });
      }

      // Apply reducer if configured
      if (action.reducerId && action.writesToState) {
        const reducer = compiledTool.reducers.find((r) => r.id === action.reducerId);
        if (reducer) {
          const currentState = await loadToolState(toolId, orgId);
          const newState = applyReducer(compiledTool.reducers, action.reducerId, currentState, output);
          await saveToolState(toolId, orgId, newState);
          
          // Emit state change event for timeline/triggers
          // events.push({ type: "state_change", payload: { path: reducer.target, value: output } });
        }
      }
      
      return { state: {}, output, events: [] };
    } catch (err) {
      const isAuthError = err instanceof IntegrationAuthError || (err as any).name === "IntegrationAuthError";
      if (isAuthError && action.integrationId === "slack") {
        const payload = {
          integration: "slack",
          status: "reauth_required",
          reason: (err as any).reason ?? "token_expired_no_refresh",
          userActionRequired: true,
        };
        if (run) {
          runLogs.push({
            id: `${action.id}:auth_required`,
            timestamp: new Date().toISOString(),
            status: "warning",
            error: err instanceof Error ? err.message : String(err),
          });
          await updateExecutionRun({ runId: run.id, status: "completed", logs: runLogs });
        }
        return { state: {}, output: null, events: [{ type: "integration_warning", payload }] };
      }
      if (run) {
        runLogs.push({
          id: `${action.id}:${isAuthError ? "auth_required" : "error"}`,
          timestamp: new Date().toISOString(),
          status: isAuthError ? "warning" : "error",
          error: err instanceof Error ? err.message : String(err),
        });
        await updateExecutionRun({ runId: run.id, status: "failed", logs: runLogs });
      }
      throw err;
    }
  };

  // Allow concurrent reads, serialize writes
  if (isRead) {
    return runner();
  } else {
    return requestCoordinator.run(coordinationKey, runner);
  }
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
