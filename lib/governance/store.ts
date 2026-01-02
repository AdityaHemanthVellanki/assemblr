import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuditEvent = {
  id: string;
  orgId: string;
  actorId?: string;
  action: string;
  targetResource: string;
  targetId?: string;
  metadata: any;
  timestamp: string;
};

export type ApprovalRequest = {
  id: string;
  workflowId: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export async function logAudit(
  orgId: string,
  action: string,
  targetResource: string,
  targetId?: string,
  metadata: any = {}
) {
  const supabase = await createSupabaseServerClient();
  const user = await supabase.auth.getUser();
  const actorId = user.data.user?.id;

  // @ts-ignore
  await (supabase.from("audit_logs") as any).insert({
    org_id: orgId,
    actor_id: actorId,
    action,
    target_resource: targetResource,
    target_id: targetId,
    metadata,
  });
}

export async function createApprovalRequest(
  orgId: string,
  workflowId: string,
  requestedBy: string
): Promise<ApprovalRequest> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("approvals") as any)
    .insert({
      org_id: orgId,
      workflow_id: workflowId,
      requested_by: requestedBy,
      status: "pending",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create approval: ${error.message}`);
  
  // Also log audit
  await logAudit(orgId, "approval.create", "approval", data.id, { workflowId });

  return {
    id: data.id,
    workflowId: data.workflow_id,
    requestedBy: data.requested_by,
    status: data.status,
    createdAt: data.created_at,
  };
}

export async function resolveApproval(
  approvalId: string,
  status: "approved" | "rejected"
) {
  const supabase = await createSupabaseServerClient();
  const user = await supabase.auth.getUser();
  
  // Update Approval
  // @ts-ignore
  const { data: approval, error } = await (supabase.from("approvals") as any)
    .update({
      status,
      approved_by: user.data.user?.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId)
    .select()
    .single();

  if (error) throw new Error(`Failed to resolve approval: ${error.message}`);

  // Update Workflow Status
  // @ts-ignore
  await (supabase.from("workflows") as any)
    .update({ approval_status: status })
    .eq("id", approval.workflow_id);

  // Log Audit
  await logAudit(approval.org_id, `approval.${status}`, "approval", approvalId, { workflowId: approval.workflow_id });
}
