import { Alert } from "./store";
import { getWorkflowsForAlert, createWorkflowRun } from "@/lib/workflows/store";
import { runWorkflow } from "@/lib/workflows/engine";

export async function triggerAction(alert: Alert, value: number, metricName: string) {
  const config = alert.actionConfig;
  const message = `[Assemblr Alert] Metric "${metricName}" triggered! Value: ${value} (${alert.comparisonOp} ${alert.thresholdValue})`;
  
  console.log(`[ACTION DISPATCH] Type: ${config.type}, Target: ${config.target}, Msg: ${message}`);

  switch (config.type) {
    case "slack":
      // In a real implementation, we would POST to Slack Webhook URL (target)
      // await fetch(config.target, { method: "POST", body: JSON.stringify({ text: message }) });
      break;
    
    case "email":
      // Stub for email sending
      break;
  }

  // Phase 8: Trigger Workflows
  try {
    const workflows = await getWorkflowsForAlert(alert.id);
    for (const wf of workflows) {
      const run = await createWorkflowRun(wf.id, { alertId: alert.id, value, metricName, timestamp: new Date().toISOString() });
      // Run async
      runWorkflow(wf, run.id, { value, metricName }).catch(err => {
        console.error(`Workflow run ${run.id} failed asynchronously`, err);
      });
    }
  } catch (err) {
    console.error("Failed to trigger workflows for alert", err);
  }
}
