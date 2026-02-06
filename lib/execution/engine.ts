// import "server-only";

import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { ExecutionPlan, ExecutionResult, IntegrationExecutor } from "./types";
import { RUNTIMES } from "@/lib/integrations/map";
import { validateSpecAgainstSchema } from "./validation";
import { synthesizeQuery } from "./synthesizer";
import { getCapability } from "@/lib/capabilities/registry";
import { ExecutionPlan as PlannerExecutionPlan } from "@/lib/execution/types";
import { resolveMetricDependency } from "./graph";
import { getLatestExecution } from "./scheduler";


export async function executeDashboard(
  orgId: string,
  spec: DashboardSpec,
  options?: { forceRefresh?: boolean }
): Promise<Record<string, ExecutionResult>> {
  // 0. Validate Schema (Non-blocking)
  const { valid, errors } = await validateSpecAgainstSchema(orgId, spec);
  if (!valid) {
    console.warn("Schema validation warnings:", errors);
    // We do NOT block execution. We try to execute anyway.
    // The executor will fail if the resource is truly inaccessible.
  }

  const results: Record<string, ExecutionResult> = {};

  // 1. Compile Spec -> Execution Plans
  const plans: ExecutionPlan[] = [];

  for (const view of spec.views) {
    // Only process views that have explicit integration/table mapping
    // or infer from metric
    let integrationId = view.integrationId;
    let table = view.table;

    // Query View: direct capability execution, no schema coupling
    if ((view as any).type === "query") {
      const v: any = view;
      const cap = getCapability(v.capability);
      if (!cap) {
        results[view.id] = {
          viewId: view.id,
          status: "error",
          error: `Unsupported capability: ${v.capability}`,
          timestamp: new Date().toISOString(),
          source: "live_api",
          rows: []
        };
        continue;
      }
      const runtimePlan = {
        viewId: view.id,
        integrationId: cap.integrationId,
        capabilityId: v.capability,
        resource: cap.resource,
        params: { ...(v.params || {}) },
      } as any;
      plans.push(runtimePlan);
      continue;
    }

    if (view.metricId) {
      const metric = spec.metrics.find((m) => m.id === view.metricId);
      if (metric) {
        if (metric.metricRef) {
          // Resolve persisted metric
          try {
            const def = await resolveMetricDependency(metric.metricRef);

            // Phase 6: Check Cache
            // If we are NOT in forceRefresh mode, try to use cache.
            if (!options?.forceRefresh) {
              const latest = await getLatestExecution(def.id);
              // TODO: Check TTL. For now, if we have ANY completed execution, use it.
              if (latest && latest.result) {
                results[view.id] = {
                  viewId: view.id,
                  status: "success",
                  rows: latest.result,
                  timestamp: latest.completedAt || new Date().toISOString(),
                  source: "cached"
                };
                continue; // Skip creating a plan for this view
              }
            }

            integrationId = def.integrationId;
            table = def.resource;
          } catch (err) {
            console.error(`Failed to resolve metric ref ${metric.metricRef.id}`, err);
          }
        } else {
          // Inline metric
          integrationId = integrationId || metric.integrationId;
          table = table || metric.table;
        }
      }
    }

    if (integrationId && table) {
      const candidateCapabilityId = `${integrationId}_${table}_list`;

      // Synthesize params from query structure
      const viewAny = view as any;
      const flatParams = { ...(viewAny.params || {}) };
      if (viewAny.query) {
        if (viewAny.query.filters) Object.assign(flatParams, viewAny.query.filters);
        if (viewAny.query.sort) {
          flatParams.sort = viewAny.query.sort.field;
          flatParams.direction = viewAny.query.sort.direction;
        }
        if (viewAny.query.limit) flatParams.limit = viewAny.query.limit;
      }

      const derivedPlan: PlannerExecutionPlan = {
        viewId: view.id,
        integrationId,
        capabilityId: candidateCapabilityId,
        resource: table,
        params: flatParams,
      };

      const runtimePlan = synthesizeQuery(derivedPlan);
      // Ensure viewId is carried over
      runtimePlan.viewId = view.id;
      console.log("Renderer received params:", runtimePlan.params);

      plans.push(runtimePlan);
    }
  }

  // 2. Execute Plans
  for (const plan of plans) {
    try {
      const runtime = RUNTIMES[plan.integrationId];
      if (!runtime) {
        throw new Error(`No runtime found for integration: ${plan.integrationId}`);
      }

      // In Composio, orgId is our "token" (the entity ID)
      const context = await runtime.resolveContext(orgId);

      if (!plan.capabilityId) {
        throw new Error(`Execution plan missing capabilityId for view: ${plan.viewId}`);
      }

      const capability = runtime.capabilities[plan.capabilityId];
      if (!capability) {
        throw new Error(`Capability ${plan.capabilityId} not supported by runtime`);
      }

      const output = await capability.execute(plan.params, context, undefined);

      results[plan.viewId] = {
        viewId: plan.viewId,
        status: "success",
        rows: Array.isArray(output) ? output : [output],
        timestamp: new Date().toISOString(),
        source: "live_api"
      };
    } catch (err) {
      results[plan.viewId] = {
        viewId: plan.viewId,
        status: "error",
        error: err instanceof Error ? err.message : "Execution failed",
        timestamp: new Date().toISOString(),
        source: "live_api",
        rows: []
      };
    }
  }

  return results;
}
