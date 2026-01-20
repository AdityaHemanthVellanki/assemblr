import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ExecutionRunStatus = "pending" | "running" | "blocked" | "completed" | "failed";

export type ExecutionRun = {
  id: string;
  orgId: string;
  toolId: string;
  triggerId?: string | null;
  actionId?: string | null;
  workflowId?: string | null;
  status: ExecutionRunStatus;
  currentStep?: string | null;
  stateSnapshot: Record<string, any>;
  input: Record<string, any>;
  retries: number;
  logs: Array<Record<string, any>>;
  createdAt: string;
  updatedAt: string;
};

export async function createExecutionRun(params: {
  orgId: string;
  toolId: string;
  triggerId?: string | null;
  actionId?: string | null;
  workflowId?: string | null;
  input?: Record<string, any>;
  stateSnapshot?: Record<string, any>;
}) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("execution_runs") as any)
    .insert({
      org_id: params.orgId,
      tool_id: params.toolId,
      trigger_id: params.triggerId ?? null,
      action_id: params.actionId ?? null,
      workflow_id: params.workflowId ?? null,
      input: params.input ?? {},
      status: "pending",
      current_step: null,
      state_snapshot: params.stateSnapshot ?? {},
      retries: 0,
      logs: [],
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create execution run: ${error?.message ?? "unknown"}`);
  }
  return mapRowToRun(data);
}

export async function updateExecutionRun(params: {
  runId: string;
  status?: ExecutionRunStatus;
  currentStep?: string | null;
  stateSnapshot?: Record<string, any>;
  retries?: number;
  logs?: Array<Record<string, any>>;
}) {
  const supabase = createSupabaseAdminClient();
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (params.status) payload.status = params.status;
  if (params.currentStep !== undefined) payload.current_step = params.currentStep;
  if (params.stateSnapshot) payload.state_snapshot = params.stateSnapshot;
  if (params.retries !== undefined) payload.retries = params.retries;
  if (params.logs) payload.logs = params.logs;
  const { error } = await (supabase.from("execution_runs") as any)
    .update(payload)
    .eq("id", params.runId);
  if (error) {
    throw new Error(`Failed to update execution run: ${error.message}`);
  }
}

export async function listExecutionRuns(params: { orgId: string; toolId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("execution_runs") as any)
    .select("*")
    .eq("org_id", params.orgId)
    .eq("tool_id", params.toolId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    throw new Error(`Failed to list execution runs: ${error.message}`);
  }
  return (data ?? []).map(mapRowToRun);
}

function mapRowToRun(row: any): ExecutionRun {
  return {
    id: row.id,
    orgId: row.org_id,
    toolId: row.tool_id,
    triggerId: row.trigger_id,
    actionId: row.action_id,
    workflowId: row.workflow_id,
    status: row.status,
    currentStep: row.current_step,
    stateSnapshot: row.state_snapshot ?? {},
    input: row.input ?? {},
    retries: row.retries ?? 0,
    logs: row.logs ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
