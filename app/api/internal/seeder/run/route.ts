/**
 * Internal Seeder API Endpoint
 *
 * POST /api/internal/seeder/run
 *
 * Requires:
 * - Authenticated user with OWNER role
 * - org.is_sandbox = true
 * - ENABLE_SEEDER_ENGINE=true env var
 *
 * Body:
 * - action: "run" | "cleanup" | "list" | "status"
 * - scenario: string (for "run")
 * - executionId: string (for "cleanup" and "status")
 * - force: boolean (for "run" — override idempotency)
 */

import { requireRole } from "@/lib/permissions";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";
import { getServerEnv } from "@/lib/env/server";
import { runSeeder, SeederError } from "@/lib/seeder/orchestrator";
import { cleanupSeedExecution } from "@/lib/seeder/cleanup";
import { listScenarios } from "@/lib/seeder/scenarios";
import { getRecentExecutions } from "@/lib/seeder/execution-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    // --- Auth: require owner role ---
    const { ctx } = await requireRole("owner");

    // --- Env check ---
    const env = getServerEnv();
    if (env.ENABLE_SEEDER_ENGINE !== "true") {
      return errorResponse(
        "Seeder engine is disabled. Set ENABLE_SEEDER_ENGINE=true in environment.",
        403,
      );
    }

    const body = await request.json();
    const action = body.action as string;

    switch (action) {
      case "run": {
        const scenario = body.scenario as string;
        if (!scenario) {
          return errorResponse("Missing required field: scenario", 400);
        }

        const result = await runSeeder({
          orgId: ctx.orgId,
          scenarioName: scenario,
          force: body.force === true,
        });

        if (result.status === "failed" && result.error) {
          const status = result.error.includes("not a sandbox") ? 403
            : result.error.includes("RATE_LIMITED") ? 429
            : result.error.includes("Missing required") ? 400
            : 500;
          return errorResponse(result.error, status);
        }

        return jsonResponse(result);
      }

      case "cleanup": {
        const executionId = body.executionId as string;
        if (!executionId) {
          return errorResponse("Missing required field: executionId", 400);
        }

        const result = await cleanupSeedExecution(ctx.orgId, executionId);
        return jsonResponse(result);
      }

      case "list": {
        const scenarios = listScenarios();
        const executions = await getRecentExecutions(ctx.orgId);
        return jsonResponse({ scenarios, executions });
      }

      case "status": {
        const executions = await getRecentExecutions(ctx.orgId, 5);
        return jsonResponse({ executions });
      }

      default:
        return errorResponse(
          `Unknown action: "${action}". Valid actions: run, cleanup, list, status`,
          400,
        );
    }
  } catch (e) {
    if (e instanceof SeederError) {
      const status = e.code === "NOT_SANDBOX" ? 403
        : e.code === "RATE_LIMITED" ? 429
        : e.code === "MISSING_INTEGRATIONS" ? 400
        : 500;
      return errorResponse(e.message, status);
    }
    return handleApiError(e);
  }
}
