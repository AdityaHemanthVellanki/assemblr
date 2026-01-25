import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRequestContext, requireOrgMember, requiresApproval, canCreateWorkflows, OrgRole } from "@/lib/permissions";
import { createApprovalRequest, logAudit } from "@/lib/governance/store";

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
  approvalStatus?: "pending" | "approved" | "rejected";
  requiresApproval?: boolean;
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

export async function createWorkflow(input: Omit<Workflow, "id" | "approvalStatus" | "requiresApproval">): Promise<Workflow> {
  const supabase = await createSupabaseServerClient();
  const { ctx } = await requireOrgMember();
  const role = ctx.org.role as OrgRole;

  if (!canCreateWorkflows(role)) {
    throw new Error("Insufficient permissions to create workflows");
  }

  const needApproval = requiresApproval(role, input.actions);
  const initialStatus = needApproval ? "pending" : "approved";

  // @ts-ignore
  const { data, error } = await (supabase.from("workflows") as any)
    .insert({
      org_id: input.orgId,
      name: input.name,
      enabled: input.enabled,
      trigger_config: input.triggerConfig,
      actions: input.actions,
      approval_status: initialStatus,
      requires_approval: needApproval,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create workflow: ${error.message}`);
  
  const workflow = mapRowToWorkflow(data);

  // Log Audit
  await logAudit(input.orgId, "workflow.create", "workflow", workflow.id, { 
    approvalStatus: initialStatus,
    requiresApproval: needApproval 
  });

  // Create Approval Request if needed
  if (needApproval) {
    await createApprovalRequest(input.orgId, workflow.id, ctx.userId);
  }

  return workflow;
}

export async function getWorkflowsForAlert(alertId: string): Promise<Workflow[]> {
  const supabase = await createSupabaseServerClient();
  
  // Filter by trigger_config->type = 'alert' AND trigger_config->refId = alertId
  // Supabase JSON filtering syntax
  // @ts-ignore
  const { data, error } = await (supabase.from("workflows") as any)
    .select()
    .eq("enabled", true)
    .eq("approval_status", "approved") // Enforce governance: Only approved workflows can run
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
    approvalStatus: row.approval_status,
    requiresApproval: row.requires_approval,
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
