import "server-only";

import { getAlertsForMetric, logAlertHistory } from "./store";
import { triggerAction } from "./actions";
import { getMetric } from "@/lib/metrics/store";

export async function evaluateAlerts(metricId: string, executionResult: any, executionId: string) {
  // 1. Fetch Alerts
  const alerts = await getAlertsForMetric(metricId);
  if (alerts.length === 0) return;

  // 2. Extract Value (Assuming scalar result for Phase 1)
  // If result is array (time series), we take the latest? 
  // Or if result is single value object { value: 10 }.
  // Let's assume standardized result format from engine has "value" property or is a number.
  let value: number | null = null;
  
  if (typeof executionResult === "number") {
    value = executionResult;
  } else if (typeof executionResult === "object" && executionResult !== null) {
    if (typeof executionResult.value === "number") {
      value = executionResult.value;
    } else if (Array.isArray(executionResult) && executionResult.length > 0) {
      // Take last item value
      const last = executionResult[executionResult.length - 1];
      if (last && typeof last.value === "number") value = last.value;
    }
  }

  if (value === null) {
    console.warn(`Could not extract numeric value for alert evaluation. Metric: ${metricId}`);
    return;
  }

  const metric = await getMetric(metricId);
  const metricName = metric?.name || "Unknown Metric";

  // 3. Evaluate Each Alert
  for (const alert of alerts) {
    let triggered = false;
    const t = alert.thresholdValue;

    switch (alert.comparisonOp) {
      case "gt": triggered = value > t; break;
      case "lt": triggered = value < t; break;
      case "gte": triggered = value >= t; break;
      case "lte": triggered = value <= t; break;
      case "eq": triggered = value === t; break;
    }

    // 4. Log History
    await logAlertHistory(alert.id, executionId, triggered, value);

    // 5. Trigger Action
    if (triggered) {
      // TODO: Check cooldown here (Phase 2)
      await triggerAction(alert, value, metricName);
    }
  }
}
