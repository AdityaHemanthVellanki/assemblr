import "server-only";

import { getMetric, Metric } from "@/lib/metrics/store";
import { createExecution, updateExecutionStatus, getLatestExecution as getLatestExecutionFromStore } from "./store";
import { executeDashboard } from "./engine";
import { DashboardSpec } from "@/lib/spec/dashboardSpec";

import { evaluateAlerts } from "@/lib/alerts/evaluator";

// Minimal spec wrapper to reuse executeDashboard
function wrapMetricInSpec(metric: Metric): DashboardSpec {
  return {
    title: "Execution Wrapper",
    metrics: [{
      id: metric.id,
      label: metric.name,
      type: metric.definition.type,
      table: metric.definition.field ? metric.resource : undefined, // Heuristic
      field: metric.definition.field,
      groupBy: metric.definition.groupBy,
      integrationId: metric.integrationId,
      // Pass the ref so engine knows to use it
      metricRef: { id: metric.id, version: metric.version }
    }],
    views: [{
      id: "exec-view",
      type: "metric",
      metricId: metric.id
    }]
  };
}

export async function getLatestExecution(metricId: string) {
  return getLatestExecutionFromStore(metricId);
}

export async function runMetricExecution(metricId: string, triggeredBy: string = "scheduler"): Promise<void> {
  // 1. Load Metric
  const metric = await getMetric(metricId);
  if (!metric) throw new Error(`Metric ${metricId} not found`);

  // 2. Create Execution Record
  const execution = await createExecution(metricId, triggeredBy);
  await updateExecutionStatus(execution.id, "running");

  try {
    // 3. Execute via Engine
    // We construct a temporary spec to execute ONLY this metric.
    const spec = wrapMetricInSpec(metric);
    
    // We need to pass orgId. Metric has it.
    const results = await executeDashboard(metric.orgId, spec, { forceRefresh: true }); // Pass force flag to bypass cache
    
    const result = results["exec-view"];
    if (result.status === "error") {
      throw new Error(result.error);
    }

    // 4. Complete
    await updateExecutionStatus(execution.id, "completed", { result: result.data });
    
    // 5. Evaluate Alerts (Async, don't block)
    evaluateAlerts(metricId, result.data, execution.id).catch(err => {
      console.error(`Alert evaluation failed for metric ${metricId}`, err);
    });
    
  } catch (err) {
    console.error(`Execution failed for metric ${metricId}`, err);
    await updateExecutionStatus(execution.id, "failed", { error: err instanceof Error ? err.message : "Unknown error" });
  }
}

export async function scheduleMetricExecution(metricId: string): Promise<boolean> {
  const metric = await getMetric(metricId);
  if (!metric) return false;

  const policy = (metric as any).execution_policy || { mode: "on_demand", ttl_seconds: 3600 };
  
  if (policy.mode === "on_demand") return false; // Scheduler ignores on_demand

  const lastExec = await getLatestExecution(metricId);
  if (!lastExec || !lastExec.completedAt) {
    // Never run, run now
    await runMetricExecution(metricId);
    return true;
  }

  // Check Schedule (Simple Interval for Phase 6)
  const now = new Date().getTime();
  const last = new Date(lastExec.completedAt).getTime();
  const interval = (policy.ttl_seconds || 3600) * 1000;

  if (now - last > interval) {
    await runMetricExecution(metricId);
    return true;
  }

  return false;
}
