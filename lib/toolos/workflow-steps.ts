import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type WorkflowStepStatus = "pending" | "running" | "completed" | "failed" | "skipped" | "blocked";

export type WorkflowStep = {
  id: string;
  runId: string;
  nodeId: string;
  actionId: string | null;
  status: WorkflowStepStatus;
  input: Record<string, any>;
  output: any;
  error: string | null;
  retries: number;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
};

function mapRow(row: any): WorkflowStep {
  return {
    id: row.id,
    runId: row.run_id,
    nodeId: row.node_id,
    actionId: row.action_id,
    status: row.status,
    input: row.input ?? {},
    output: row.output,
    error: row.error,
    retries: row.retries ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

export async function createWorkflowStep(params: {
  runId: string;
  nodeId: string;
  actionId?: string | null;
  status?: WorkflowStepStatus;
  input?: Record<string, any>;
}): Promise<WorkflowStep> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("workflow_steps") as any)
    .insert({
      run_id: params.runId,
      node_id: params.nodeId,
      action_id: params.actionId ?? null,
      status: params.status ?? "pending",
      input: params.input ?? {},
    })
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(`Failed to create workflow step: ${error?.message ?? "unknown"}`);
  }
  return mapRow(data);
}

export async function updateWorkflowStep(
  stepId: string,
  updates: Partial<{
    status: WorkflowStepStatus;
    output: any;
    error: string | null;
    retries: number;
    startedAt: string;
    completedAt: string;
    durationMs: number;
  }>,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const payload: Record<string, any> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.output !== undefined) payload.output = updates.output;
  if (updates.error !== undefined) payload.error = updates.error;
  if (updates.retries !== undefined) payload.retries = updates.retries;
  if (updates.startedAt !== undefined) payload.started_at = updates.startedAt;
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
  if (updates.durationMs !== undefined) payload.duration_ms = updates.durationMs;
  const { error } = await (supabase.from("workflow_steps") as any)
    .update(payload)
    .eq("id", stepId);
  if (error) {
    throw new Error(`Failed to update workflow step: ${error.message}`);
  }
}

export async function getStepsForRun(runId: string): Promise<WorkflowStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("workflow_steps") as any)
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to get workflow steps: ${error.message}`);
  }
  return (data ?? []).map(mapRow);
}

export async function getIncompleteSteps(runId: string): Promise<WorkflowStep[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("workflow_steps") as any)
    .select("*")
    .eq("run_id", runId)
    .in("status", ["pending", "running", "failed"])
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Failed to get incomplete steps: ${error.message}`);
  }
  return (data ?? []).map(mapRow);
}
