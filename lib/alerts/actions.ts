import { Alert } from "./store";

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
}
