import "server-only";

import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { getMetric, Metric } from "@/lib/metrics/store";

export type ResolvedMetric = {
  id: string; // The ID used in the Spec
  definition: Metric; // The loaded definition from registry
};

export async function resolveMetricDependency(
  metricRef: { id: string; version?: number }
): Promise<Metric> {
  const metric = await getMetric(metricRef.id);
  if (!metric) {
    throw new Error(`Metric not found: ${metricRef.id}`);
  }
  // In Phase 1, we ignore version check or just take latest.
  return metric;
}

export async function buildQueryGraph(spec: DashboardSpec): Promise<ResolvedMetric[]> {
  const resolved: ResolvedMetric[] = [];
  
  for (const m of spec.metrics) {
    if (m.metricRef) {
      const def = await resolveMetricDependency(m.metricRef);
      resolved.push({ id: m.id, definition: def });
    } else if (m.table && m.type) {
      // Inline metric - treat as ephemeral
      // We don't need to resolve it from DB, but we should treat it as a valid node.
      // For the Engine, we might want to normalize this.
      // But Graph Resolver specifically deals with Dependencies.
    }
  }

  return resolved;
}
