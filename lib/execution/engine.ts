import "server-only";

import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { ExecutionPlan, ExecutionResult, IntegrationExecutor } from "./types";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { GitHubExecutor } from "@/lib/integrations/executors/github";
import { LinearExecutor } from "@/lib/integrations/executors/linear";
import { SlackExecutor } from "@/lib/integrations/executors/slack";
import { NotionExecutor } from "@/lib/integrations/executors/notion";
import { GoogleExecutor } from "@/lib/integrations/executors/google";
import { validateSpecAgainstSchema } from "./validation";

const EXECUTORS: Record<string, IntegrationExecutor> = {
  github: new GitHubExecutor(),
  linear: new LinearExecutor(),
  slack: new SlackExecutor(),
  notion: new NotionExecutor(),
  google: new GoogleExecutor(),
};

export async function executeDashboard(
  orgId: string,
  spec: DashboardSpec
): Promise<Record<string, ExecutionResult>> {
  // 0. Validate Schema
  const { valid, errors } = await validateSpecAgainstSchema(orgId, spec);
  if (!valid) {
    // Return errors for all views
    const results: Record<string, ExecutionResult> = {};
    const errorMsg = `Schema Validation Failed: ${errors.join(", ")}`;
    for (const view of spec.views) {
      results[view.id] = {
        viewId: view.id,
        status: "error",
        error: errorMsg,
        timestamp: new Date().toISOString(),
        source: "system",
      };
    }
    return results;
  }

  const results: Record<string, ExecutionResult> = {};

  // 1. Compile Spec -> Execution Plans
  const plans: ExecutionPlan[] = [];

  for (const view of spec.views) {
    // Only process views that have explicit integration/table mapping
    // or infer from metric
    let integrationId = view.integrationId;
    let table = view.table;

    if (view.metricId) {
      const metric = spec.metrics.find((m) => m.id === view.metricId);
      if (metric) {
        integrationId = integrationId || metric.integrationId;
        table = table || metric.table;
      }
    }

    if (integrationId && table) {
      plans.push({
        viewId: view.id,
        integrationId,
        resource: table,
      });
    }
  }

  // 2. Execute Plans
  for (const plan of plans) {
    try {
      const executor = EXECUTORS[plan.integrationId];
      if (!executor) {
        throw new Error(`No executor found for integration: ${plan.integrationId}`);
      }

      // Get credentials (this handles refresh automatically)
      const accessToken = await getValidAccessToken(orgId, plan.integrationId);
      
      const result = await executor.execute({
        plan,
        credentials: { access_token: accessToken },
      });

      results[plan.viewId] = result;
    } catch (err) {
      // Fail fast per plan, but allow other plans to proceed?
      // Requirement: "If ANY step fails -> return error, not data" is for the whole flow usually,
      // but here we might want granular errors per view.
      // However, the prompt says "Fail explicitly if execution is impossible".
      // We will capture the error in the result object so the UI can show it explicitly.
      results[plan.viewId] = {
        viewId: plan.viewId,
        status: "error",
        error: err instanceof Error ? err.message : "Execution failed",
        timestamp: new Date().toISOString(),
        source: plan.integrationId,
      };
    }
  }

  return results;
}
