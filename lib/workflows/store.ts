import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type WorkflowAction = {
  type: "slack" | "email" | "github_issue" | "linear_issue";
  config: Record<string, any>;
};

export type Workflow = {
  id: string;
  orgId: string;
  name: string;
  enabled: boolean;
  triggerConfig: {
    type: "alert" | "schedule";
    refId?: string; // alert_id
    cron?: string;
  };
  actions: WorkflowAction[];
};

export type WorkflowRun = {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  logs: any[];
  error?: string;
};

export async function createWorkflow(input: Omit<Workflow, "id">): Promise<Workflow> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("workflows") as any)
    .insert({
      org_id: input.orgId,
      name: input.name,
      enabled: input.enabled,
      trigger_config: input.triggerConfig,
      actions: input.actions,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create workflow: ${error.message}`);
  return mapRowToWorkflow(data);
}

export async function getWorkflowsForAlert(alertId: string): Promise<Workflow[]> {
  const supabase = await createSupabaseServerClient();
  
  // Filter by trigger_config->type = 'alert' AND trigger_config->refId = alertId
  // Supabase JSON filtering syntax
  // @ts-ignore
  const { data, error } = await (supabase.from("workflows") as any)
    .select()
    .eq("enabled", true)
    .contains("trigger_config", { type: "alert", refId: alertId });

  if (error || !data) return [];
  return data.map(mapRowToWorkflow);
}

export async function createWorkflowRun(workflowId: string, triggerEvent: any): Promise<WorkflowRun> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("workflow_runs") as any)
    .insert({
      workflow_id: workflowId,
      status: "pending",
      trigger_event: triggerEvent,
      logs: [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create workflow run: ${error.message}`);
  return mapRowToRun(data);
}

export async function updateWorkflowRun(id: string, updates: Partial<WorkflowRun>) {
  const supabase = await createSupabaseServerClient();
  
  const payload: any = {};
  if (updates.status) payload.status = updates.status;
  if (updates.status === "completed" || updates.status === "failed") {
    payload.completed_at = new Date().toISOString();
  }
  if (updates.logs) payload.logs = updates.logs;
  if (updates.error) payload.error = updates.error;

  // @ts-ignore
  await (supabase.from("workflow_runs") as any).update(payload).eq("id", id);
}

function mapRowToWorkflow(row: any): Workflow {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    enabled: row.enabled,
    triggerConfig: row.trigger_config,
    actions: row.actions,
  };
}

function mapRowToRun(row: any): WorkflowRun {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    logs: row.logs,
    error: row.error,
  };
}
