import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { compileToolSystem } from "@/lib/toolos/compiler";
import { ToolSystemSpec, StateReducer } from "@/lib/toolos/spec";
import { loadToolState, saveToolState } from "@/lib/toolos/state-store";
import { saveToolMemory } from "@/lib/toolos/memory-store";

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
}) {
  const { orgId, toolId, spec, actionId, input, userId } = params;
  const compiled = compileToolSystem(spec);
  const action = compiled.actions.get(actionId);
  if (!action) {
    throw new Error(`Action ${actionId} not found`);
  }

  const runtime = RUNTIMES[action.integrationId];
  if (!runtime) {
    throw new Error(`Runtime not found for integration ${action.integrationId}`);
  }
  const executor = runtime.capabilities[action.capabilityId];
  if (!executor) {
    throw new Error(`Capability ${action.capabilityId} not found for ${action.integrationId}`);
  }

  const token = await getValidAccessToken(orgId, action.integrationId);
  const context = await runtime.resolveContext(token);
  if (runtime.checkPermissions) {
    runtime.checkPermissions(action.capabilityId, DEV_PERMISSIONS);
  }
  const tracer = new ExecutionTracer("run");
  const output = await executor.execute(input, context, tracer);

  const state = await loadToolState(toolId, orgId);
  const nextState = applyReducer(spec.state.reducers, action.reducerId, state, output);
  await saveToolState(toolId, orgId, nextState);
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
