/**
 * Seeder Orchestrator — main entry point for the Integration Seeder Engine.
 *
 * Responsibilities:
 * 1. Validate sandbox org + env var
 * 2. Load Composio connections
 * 3. Check idempotency
 * 4. Execute scenario steps in dependency order
 * 5. Resolve step dependencies (inject IDs from prior steps)
 * 6. Log every action to DB
 * 7. Return structured result
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { loadSeederConnections, resolveConnectionId } from "./composio-exec";
import { createSeederContext, tagPayload, type SeederContext } from "./context";
import { computeExecutionHash, checkIdempotency } from "./idempotency";
import {
  createExecution,
  logStepResult,
  finalizeExecution,
  countTodayExecutions,
} from "./execution-logger";
import { getScenario, listScenarios } from "./scenarios";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";
import type {
  SeedStep,
  StepResult,
  SeederResult,
  SeederIntegration,
} from "./types";

/** Max scenario runs per org per day. */
const MAX_DAILY_EXECUTIONS = 20;

/** Rate limit between steps (ms). */
const STEP_DELAY_MS = 500;

/**
 * Run a seed scenario for an org.
 *
 * This is the main public API for the seeder engine.
 */
export async function runSeeder(params: {
  orgId: string;
  scenarioName: string;
  force?: boolean;
}): Promise<SeederResult> {
  const { orgId, scenarioName, force } = params;
  const startTime = Date.now();
  const logs: string[] = [];
  const log = (level: "info" | "warn" | "error", msg: string) => {
    const entry = `[Seeder][${level.toUpperCase()}] ${msg}`;
    logs.push(entry);
    console.log(entry);
  };

  try {
    // --- Safety checks ---
    validateEnvironment();
    await validateSandboxOrg(orgId);

    // --- Rate limiting ---
    const todayCount = await countTodayExecutions(orgId);
    if (todayCount >= MAX_DAILY_EXECUTIONS) {
      throw new SeederError(
        `Daily execution limit reached (${MAX_DAILY_EXECUTIONS}). Try again tomorrow.`,
        "RATE_LIMITED",
      );
    }

    // --- Load scenario ---
    const scenario = getScenario(scenarioName);
    if (!scenario) {
      const available = listScenarios().map((s) => s.name).join(", ");
      throw new SeederError(
        `Unknown scenario: "${scenarioName}". Available: ${available}`,
        "INVALID_SCENARIO",
      );
    }

    log("info", `Starting scenario: ${scenario.name} — ${scenario.description}`);

    // --- Load connections ---
    const connectionMap = await loadSeederConnections(orgId);
    log("info", `Loaded ${connectionMap.size} connections: ${[...connectionMap.keys()].join(", ")}`);

    // --- Check required integrations ---
    const missing = scenario.requiredIntegrations.filter(
      (id) => !resolveConnectionId(connectionMap, id),
    );
    if (missing.length > 0) {
      throw new SeederError(
        `Missing required integrations: ${missing.join(", ")}. Connect them first.`,
        "MISSING_INTEGRATIONS",
      );
    }

    // --- Idempotency check ---
    const executionHash = computeExecutionHash(orgId, scenarioName);
    if (!force) {
      const existingId = await checkIdempotency(orgId, executionHash);
      if (existingId) {
        log("warn", `Idempotency hit: execution ${existingId} already exists for this time window`);
        return {
          executionId: existingId,
          orgId,
          scenario: scenarioName,
          status: "completed",
          steps: [],
          resourceCount: 0,
          totalDurationMs: Date.now() - startTime,
          error: "Duplicate execution (idempotency). Use force=true to override.",
        };
      }
    }

    // --- Create execution record ---
    const executionId = await createExecution({
      orgId,
      scenarioName,
      executionHash,
    });
    log("info", `Created execution: ${executionId}`);

    // --- Create context ---
    const ctx = createSeederContext({
      orgId,
      executionId,
      connectionMap,
      log,
    });

    // --- Execute steps ---
    const stepResults: StepResult[] = [];
    let resourceCount = 0;
    let hasErrors = false;

    for (const step of scenario.steps) {
      // Check dependencies are satisfied
      const unsatisfied = (step.dependsOn || []).filter(
        (depId) => !ctx.stepResults.has(depId),
      );
      if (unsatisfied.length > 0) {
        // Check if any dependency failed
        const failedDeps = unsatisfied.filter((depId) => {
          const depResult = stepResults.find((r) => r.stepId === depId);
          return depResult?.status === "error";
        });
        if (failedDeps.length > 0) {
          log("warn", `Skipping step ${step.id}: dependency failed (${failedDeps.join(", ")})`);
          continue;
        }
      }

      // Rate limit between steps
      if (stepResults.length > 0) {
        await sleep(STEP_DELAY_MS);
      }

      const result = await executeStep(ctx, step, log);
      stepResults.push(result);

      // Store result for dependency resolution
      ctx.stepResults.set(step.id, result);

      // Log to DB
      await logStepResult(executionId, result, step.payload);

      if (result.status === "success" && result.externalResourceId) {
        resourceCount++;
      }
      if (result.status === "error") {
        hasErrors = true;
      }
    }

    // --- Finalize ---
    const status = hasErrors
      ? stepResults.every((r) => r.status === "error")
        ? "failed"
        : "partial"
      : "completed";

    await finalizeExecution(executionId, status, resourceCount);

    const totalDuration = Date.now() - startTime;
    log("info", `Scenario ${scenarioName} ${status}. Resources: ${resourceCount}, Duration: ${totalDuration}ms`);

    return {
      executionId,
      orgId,
      scenario: scenarioName,
      status,
      steps: stepResults,
      resourceCount,
      totalDurationMs: totalDuration,
    };
  } catch (error: any) {
    log("error", `Seeder failed: ${error.message}`);
    return {
      executionId: "",
      orgId,
      scenario: scenarioName,
      status: "failed",
      steps: [],
      resourceCount: 0,
      totalDurationMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

/**
 * Execute a single scenario step.
 */
async function executeStep(
  ctx: SeederContext,
  step: SeedStep,
  log: (level: "info" | "warn" | "error", msg: string) => void,
): Promise<StepResult> {
  const startTime = Date.now();

  try {
    // Resolve payload with dependency data
    const resolvedPayload = resolvePayload(ctx, step);

    log("info", `Step ${step.id}: ${step.action} via ${step.composioAction}`);

    const result = await ctx.execAction(
      step.integration,
      step.composioAction,
      resolvedPayload,
    );

    const duration = Date.now() - startTime;

    // Extract resource ID from response
    let externalResourceId: string | undefined;
    if (step.resourceIdPath && result) {
      const extracted = extractResourceId(result, step.resourceIdPath);
      if (extracted) {
        externalResourceId = String(extracted);
      }
    }

    // For list operations, store the full result for dependency resolution
    const isListOp = step.action.startsWith("list_");

    const stepResult: StepResult = {
      stepId: step.id,
      integration: step.integration,
      action: step.action,
      composioAction: step.composioAction,
      status: "success",
      externalResourceId,
      externalResourceType: step.resourceType,
      data: isListOp ? result : (externalResourceId ? { id: externalResourceId, ...summarizeResult(result) } : summarizeResult(result)),
      durationMs: duration,
    };

    log("info", `Step ${step.id} succeeded in ${duration}ms${externalResourceId ? ` (resource: ${externalResourceId})` : ""}`);
    return stepResult;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    log("error", `Step ${step.id} failed: ${error.message}`);

    return {
      stepId: step.id,
      integration: step.integration,
      action: step.action,
      composioAction: step.composioAction,
      status: "error",
      error: error.message,
      durationMs: duration,
    };
  }
}

/**
 * Resolve step payload by injecting data from dependent steps.
 *
 * Handles specific patterns:
 * - Linear issue creation: injects teamId from list_teams step
 * - Slack messages: injects channel from list_channels step
 * - Slack thread replies: injects channel + thread_ts from parent message
 * - GitHub issues: injects owner + repo from list_repos step
 * - Notion pages: searches for a parent page if needed
 */
function resolvePayload(ctx: SeederContext, step: SeedStep): Record<string, any> {
  let payload = { ...step.payload };

  // Auto-tag text fields with [ASSEMBLR_SEED]
  payload = tagPayload(payload, ["title", "text", "body", "description", "dealname", "summary", "name"]);

  // --- Linear: inject team_id ---
  if (step.composioAction === "LINEAR_CREATE_LINEAR_ISSUE" && !payload.team_id && !payload.teamId) {
    const teamsResult = ctx.stepResults.get("linear_teams");
    if (teamsResult?.data) {
      // LINEAR_GET_ALL_LINEAR_TEAMS returns { items: [], teams: [...] }
      // extractPayloadArray picks up `items` (empty) first, so check .teams directly
      const raw = teamsResult.data;
      const teams = Array.isArray(raw)
        ? raw
        : raw?.teams && Array.isArray(raw.teams)
          ? raw.teams
          : extractPayloadArray(raw);
      if (teams.length > 0) {
        // Composio uses snake_case: team_id
        payload.team_id = teams[0].id;
      }
    }
  }

  // --- Slack: inject channel ---
  if (step.composioAction === "SLACKBOT_SEND_MESSAGE" && !payload.channel) {
    // For thread replies, get channel + thread_ts from parent message
    if (step.action === "reply_thread") {
      const parentResult = ctx.stepResults.get("slack_alert");
      if (parentResult?.data) {
        payload.channel = parentResult.data.channel || parentResult.data.channel_id;
        payload.thread_ts = parentResult.externalResourceId || parentResult.data.ts;
      }
    }

    // If still no channel, pick from list
    if (!payload.channel) {
      const channelsResult = ctx.stepResults.get("slack_channels");
      if (channelsResult?.data) {
        const channels = Array.isArray(channelsResult.data)
          ? channelsResult.data
          : extractPayloadArray(channelsResult.data);
        // Prefer a channel named general, incidents, or deals
        const preferred = channels.find(
          (c: any) =>
            c.name === "general" ||
            c.name === "incidents" ||
            c.name === "deals" ||
            c.name === "engineering",
        );
        const channel = preferred || channels[0];
        if (channel) {
          payload.channel = channel.id;
        }
      }
    }
  }

  // --- GitHub: inject owner + repo ---
  if (step.composioAction === "GITHUB_CREATE_AN_ISSUE" && (!payload.owner || !payload.repo)) {
    const reposResult = ctx.stepResults.get("github_repos");
    if (reposResult?.data) {
      const repos = Array.isArray(reposResult.data)
        ? reposResult.data
        : extractPayloadArray(reposResult.data);
      if (repos.length > 0) {
        const repo = repos[0];
        payload.owner = payload.owner || repo.owner?.login || repo.full_name?.split("/")[0];
        payload.repo = payload.repo || repo.name;
      }
    }
  }

  // --- Notion: inject parent_id + format ---
  if (step.composioAction === "NOTION_CREATE_NOTION_PAGE") {
    // Inject parent_id from notion_pages search if not already set
    if (!payload.parent_id) {
      const pagesResult = ctx.stepResults.get("notion_pages");
      if (pagesResult?.data) {
        const pages = Array.isArray(pagesResult.data)
          ? pagesResult.data
          : extractPayloadArray(pagesResult.data);
        // Use first page or database as parent
        if (pages.length > 0) {
          payload.parent_id = pages[0].id;
        }
      }
    }

    // Remove content field — NOTION_CREATE_NOTION_PAGE only accepts title + parent_id
    delete payload.content;
  }

  return payload;
}

/**
 * Extract a resource ID from a Composio action response.
 */
function extractResourceId(data: any, path: string): string | undefined {
  if (!data) return undefined;

  // Direct property access
  if (path in data) return data[path];

  // Nested path (e.g., "data.id")
  const parts = path.split(".");
  let current = data;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }

  return current != null ? String(current) : undefined;
}

/**
 * Summarize a result object (keep it small for storage).
 */
function summarizeResult(data: any): any {
  if (!data) return null;
  if (typeof data !== "object") return data;

  // Keep key identifiers
  const summary: Record<string, any> = {};
  const keepKeys = ["id", "key", "number", "name", "title", "url", "html_url", "ts", "channel", "channel_id"];
  for (const key of keepKeys) {
    if (key in data) summary[key] = data[key];
  }

  return Object.keys(summary).length > 0 ? summary : { _type: typeof data };
}

// --- Safety validation ---

function validateEnvironment(): void {
  const env = getServerEnv();
  if (env.ENABLE_SEEDER_ENGINE !== "true") {
    throw new SeederError(
      "Seeder engine is disabled. Set ENABLE_SEEDER_ENGINE=true in environment.",
      "DISABLED",
    );
  }
  if (!env.COMPOSIO_API_KEY) {
    throw new SeederError("COMPOSIO_API_KEY is required for seeder engine.", "CONFIG_ERROR");
  }
}

async function validateSandboxOrg(orgId: string): Promise<void> {
  // Allow env-based override for when migration hasn't been applied yet
  const sandboxOrgIds = process.env.SANDBOX_ORG_IDS;
  if (sandboxOrgIds) {
    const allowed = sandboxOrgIds.split(",").map((s) => s.trim());
    if (allowed.includes(orgId)) {
      console.log(`[Seeder] Org ${orgId} allowed via SANDBOX_ORG_IDS env var`);
      return;
    }
  }

  const supabase = createSupabaseAdminClient();

  // Try DB-based check (requires migration to have been applied)
  try {
    const { data, error } = await (supabase.from("organizations") as any)
      .select("id, name, is_sandbox")
      .eq("id", orgId)
      .single();

    if (error || !data) {
      throw new SeederError(`Organization not found: ${orgId}`, "ORG_NOT_FOUND");
    }

    if (!data.is_sandbox) {
      throw new SeederError(
        `Organization "${data.name}" (${orgId}) is not a sandbox org. ` +
        `Set is_sandbox=true in DB or add org ID to SANDBOX_ORG_IDS env var.`,
        "NOT_SANDBOX",
      );
    }
  } catch (e: any) {
    // If is_sandbox column doesn't exist yet, fall back to env check
    if (e.message?.includes("is_sandbox") || e.code === "42703") {
      if (!sandboxOrgIds) {
        throw new SeederError(
          `Migration not applied (is_sandbox column missing). ` +
          `Add SANDBOX_ORG_IDS=${orgId} to .env.local as a workaround.`,
          "NOT_SANDBOX",
        );
      }
    }
    throw e;
  }
}

export class SeederError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SeederError";
    this.code = code;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
