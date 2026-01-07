import "server-only";

import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { getDiscoveredSchemas } from "@/lib/schema/store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getCapability } from "@/lib/capabilities/registry";
import { ExecutionPlan } from "@/lib/execution/types";

export function validatePlanAgainstCapabilities(plan: ExecutionPlan): { valid: boolean; error?: string } {
  // 1. Static Registry Check
  if (!plan.capabilityId) {
     return { valid: false, error: "Plan missing capabilityId" };
  }
  const capability = getCapability(plan.capabilityId);
  if (!capability) {
    return { valid: false, error: `Unknown capability ID: ${plan.capabilityId}` };
  }

  if (capability.integrationId !== plan.integrationId) {
    return { valid: false, error: `Capability ${plan.capabilityId} does not belong to integration ${plan.integrationId}` };
  }

  // NOTE: resource is no longer validated against plan.resource because plan.resource is derived from capability
  // However, if the plan DOES specify a resource (e.g. from legacy code), we can check consistency.
  if (plan.resource && capability.resource !== plan.resource) {
      console.warn(`[Validation Warning] Plan resource ${plan.resource} does not match capability resource ${capability.resource}. Using capability resource.`);
  }

  // Validate Params
  const params = plan.params || {};
  if (capability.constraints?.requiredFilters && capability.constraints.requiredFilters.length > 0) {
    for (const key of capability.constraints.requiredFilters) {
      const val = (params as Record<string, unknown>)[key];
      if (val === undefined || val === null || (typeof val === "string" && val.trim().length === 0)) {
        return { valid: false, error: `Missing required parameter "${key}" for capability ${plan.capabilityId}` };
      }
    }
  }
  for (const key of Object.keys(params)) {
    if (!capability.supportedFields.includes(key)) {
      // PERMISSIVE: Warn but do not fail.
      // The executor should ignore unsupported params.
      console.warn(`[Validation Warning] Parameter "${key}" is not supported by capability ${plan.capabilityId}. Ignoring.`);
    }
  }

  return { valid: true };
}

export async function validateSpecAgainstSchema(
  orgId: string,
  spec: DashboardSpec
): Promise<{ valid: boolean; errors: string[] }> {
  const schemas = await getDiscoveredSchemas(orgId);
  const errors: string[] = [];
  const supabase = await createSupabaseServerClient();
  const { data: connRows } = await (supabase.from("integration_connections") as any)
    .select("integration_id")
    .eq("org_id", orgId);
  const connectedIds: string[] = Array.isArray(connRows)
    ? connRows.map((r: any) => r.integration_id).filter((x: any) => typeof x === "string")
    : [];

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
      if (connectedIds.includes(metric.integrationId)) {
        // Integration is connected but has no schema yet.
        // This is valid in execution-first mode. We allow it.
        // We do NOT push an error.
      } else {
        errors.push(`Metric "${metric.label}" references unknown integration "${metric.integrationId}"`);
      }
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
        if (connectedIds.includes(view.integrationId)) {
          // Integration is connected but has no schema yet.
          // This is valid in execution-first mode. We allow it.
        } else {
          errors.push(`View "${view.id}" references unknown integration "${view.integrationId}"`);
        }
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
