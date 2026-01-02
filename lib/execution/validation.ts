import "server-only";

import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { getDiscoveredSchemas } from "@/lib/schema/store";

export async function validateSpecAgainstSchema(
  orgId: string,
  spec: DashboardSpec
): Promise<{ valid: boolean; errors: string[] }> {
  const schemas = await getDiscoveredSchemas(orgId);
  const errors: string[] = [];

  // Index schemas for faster lookup: integrationId -> resource -> Set<field>
  const schemaMap: Record<string, Record<string, Set<string>>> = {};

  for (const s of schemas) {
    if (!schemaMap[s.integrationId]) {
      schemaMap[s.integrationId] = {};
    }
    schemaMap[s.integrationId][s.resource] = new Set(s.fields.map((f) => f.name));
  }

  // Validate Metrics
  for (const metric of spec.metrics) {
    if (!metric.integrationId || !metric.table) continue;

    const resources = schemaMap[metric.integrationId];
    if (!resources) {
      errors.push(`Metric "${metric.label}" references unknown integration "${metric.integrationId}"`);
      continue;
    }

    const fields = resources[metric.table];
    if (!fields) {
      errors.push(`Metric "${metric.label}" references unknown table "${metric.table}" in "${metric.integrationId}"`);
      continue;
    }

    if (metric.field && !fields.has(metric.field)) {
      errors.push(`Metric "${metric.label}" references unknown field "${metric.field}" in "${metric.table}"`);
    }
  }

  // Validate Views
  for (const view of spec.views) {
    if (view.type === "table") {
      if (!view.integrationId || !view.table) continue;

      const resources = schemaMap[view.integrationId];
      if (!resources) {
        errors.push(`View "${view.id}" references unknown integration "${view.integrationId}"`);
        continue;
      }

      if (!resources[view.table]) {
        errors.push(`View "${view.id}" references unknown table "${view.table}" in "${view.integrationId}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
