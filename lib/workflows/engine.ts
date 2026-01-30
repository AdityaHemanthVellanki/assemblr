// import "server-only";

import { Workflow, WorkflowAction, updateWorkflowRun } from "./store";
import { logAudit } from "@/lib/governance/store";
import { withTrace } from "@/lib/observability/tracer";
import { estimateWorkflowCost } from "@/lib/security/cost-model";
import { checkAndConsumeBudget } from "@/lib/security/cost-store";

export async function runWorkflow(workflow: Workflow, runId: string, context: any, parentTraceId?: string) {
  // Phase 9: Governance Check
  if (workflow.requiresApproval && workflow.approvalStatus !== "approved") {
    const err = "Governance Error: Workflow requires approval but is not approved.";
    console.error(`Blocked workflow ${workflow.id}: ${err}`);
    await updateWorkflowRun(runId, { status: "failed", error: err });
    return;
  }

  await withTrace(
    {
      orgId: workflow.orgId,
      source: "dependency",
      triggerRef: workflow.id,
      dependencies: parentTraceId ? [parentTraceId] : [],
      metadata: { workflowName: workflow.name, actions: workflow.actions.length }
    },
    "workflow",
    { runId, context },
    async (traceId) => {
      // Phase 11: Cost Control
      const estimatedCost = estimateWorkflowCost(workflow.actions);
      await checkAndConsumeBudget(workflow.orgId, estimatedCost);

      await updateWorkflowRun(runId, { status: "running" });
      
      const logs: any[] = [];
      
      try {
        for (const action of workflow.actions) {
          logs.push({ type: "action_start", action: action.type, timestamp: new Date().toISOString() });
          
          try {
            await executeAction(action, context);
            logs.push({ type: "action_success", action: action.type });
            
            // Log Audit for successful action execution
            await logAudit(workflow.orgId, "workflow.action.execute", "workflow", workflow.id, { 
              action: action.type,
              runId,
              traceId
            });

          } catch (err) {
            logs.push({ type: "action_error", action: action.type, error: String(err) });
            throw err; // Stop workflow on failure (Phase 8 requirement)
          }
        }
        
        await updateWorkflowRun(runId, { status: "completed", logs });
        return { logs };
      } catch (err) {
        console.error(`Workflow ${workflow.id} failed`, err);
        await updateWorkflowRun(runId, { status: "failed", error: String(err), logs });
        throw err;
      }
    }
  );
}

async function executeAction(action: WorkflowAction, context: any) {
  // Dispatch to integrations
  console.log(`[WORKFLOW EXECUTION] Action: ${action.type}`, { config: action.config, context });
  
  switch (action.type) {
    case "slack":
      // Call Slack API using context.value, context.metricName, etc.
      throw new Error("Slack workflow action not implemented yet");
    case "email":
      throw new Error("Email workflow action not implemented yet");
    case "github_issue":
      throw new Error("GitHub workflow action not implemented yet");
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}
