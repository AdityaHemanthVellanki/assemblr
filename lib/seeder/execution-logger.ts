/**
 * Seeder execution logger.
 *
 * Persists every seeder action to the seeder_execution_logs table
 * for audit trail, cleanup, and debugging.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StepResult } from "./types";

/** Whether DB tables exist (cached after first check). */
let _dbTablesAvailable: boolean | null = null;

async function checkDbTables(): Promise<boolean> {
  if (_dbTablesAvailable !== null) return _dbTablesAvailable;
  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await (supabase.from("seeder_executions") as any)
      .select("id")
      .limit(1);
    _dbTablesAvailable = !error;
    if (error) {
      console.warn(`[Seeder] DB tables not available (${error.message}). Using in-memory logging.`);
    }
  } catch {
    _dbTablesAvailable = false;
  }
  return _dbTablesAvailable;
}

/**
 * Create a new seeder execution record.
 * Falls back to a generated UUID if DB tables don't exist.
 */
export async function createExecution(params: {
  orgId: string;
  scenarioName: string;
  executionHash: string;
}): Promise<string> {
  if (!(await checkDbTables())) {
    // Fallback: generate a local ID
    const fallbackId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[Seeder] Using local execution ID: ${fallbackId} (DB tables not available)`);
    return fallbackId;
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await (supabase.from("seeder_executions") as any)
    .insert({
      org_id: params.orgId,
      scenario_name: params.scenarioName,
      execution_hash: params.executionHash,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn(`[Seeder] Failed to create DB execution record: ${error?.message}. Using fallback.`);
    return `local_${Date.now()}`;
  }

  return data.id;
}

/**
 * Log a single step result to the execution log.
 * Silently skips if DB tables don't exist.
 */
export async function logStepResult(
  executionId: string,
  result: StepResult,
  inputPayload?: Record<string, any>,
): Promise<void> {
  if (!(await checkDbTables())) return;

  const supabase = createSupabaseAdminClient();

  const { error } = await (supabase.from("seeder_execution_logs") as any).insert({
    execution_id: executionId,
    integration: result.integration,
    action: result.action,
    composio_action: result.composioAction,
    external_resource_id: result.externalResourceId || null,
    external_resource_type: result.externalResourceType || null,
    input_payload: inputPayload || null,
    output_summary: result.data ? summarizeOutput(result.data) : null,
    status: result.status,
    error_message: result.error || null,
    duration_ms: result.durationMs,
  });

  if (error) {
    console.error(`[Seeder] Failed to log step result: ${error.message}`);
  }
}

/**
 * Mark an execution as completed or failed.
 */
export async function finalizeExecution(
  executionId: string,
  status: "completed" | "failed" | "partial",
  resourceCount: number,
  errorMessage?: string,
): Promise<void> {
  if (!(await checkDbTables())) return;

  const supabase = createSupabaseAdminClient();

  await (supabase.from("seeder_executions") as any)
    .update({
      status,
      resource_count: resourceCount,
      error_message: errorMessage || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", executionId);
}

/**
 * Get all execution logs for a given execution (used by cleanup).
 */
export async function getExecutionLogs(executionId: string): Promise<
  Array<{
    id: string;
    integration: string;
    action: string;
    composio_action: string;
    external_resource_id: string | null;
    external_resource_type: string | null;
    status: string;
  }>
> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await (supabase.from("seeder_execution_logs") as any)
    .select("id, integration, action, composio_action, external_resource_id, external_resource_type, status")
    .eq("execution_id", executionId)
    .eq("status", "success")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch execution logs: ${error.message}`);
  }

  return data || [];
}

/**
 * Mark a log entry as cleaned up.
 */
export async function markLogCleaned(logId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  await (supabase.from("seeder_execution_logs") as any)
    .update({ status: "cleaned" })
    .eq("id", logId);
}

/**
 * Mark an execution as cleaned.
 */
export async function markExecutionCleaned(executionId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  await (supabase.from("seeder_executions") as any)
    .update({ status: "cleaned" })
    .eq("id", executionId);
}

/**
 * Get recent executions for an org.
 */
export async function getRecentExecutions(
  orgId: string,
  limit: number = 10,
): Promise<Array<{ id: string; scenario_name: string; status: string; resource_count: number; created_at: string }>> {
  const supabase = createSupabaseAdminClient();

  const { data } = await (supabase.from("seeder_executions") as any)
    .select("id, scenario_name, status, resource_count, created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return data || [];
}

/**
 * Count executions for an org today (for rate limiting).
 */
export async function countTodayExecutions(orgId: string): Promise<number> {
  if (!(await checkDbTables())) return 0;

  const supabase = createSupabaseAdminClient();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await (supabase.from("seeder_executions") as any)
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", todayStart.toISOString());

  return count || 0;
}

/** Truncate output data for storage (avoid JSONB bloat). */
function summarizeOutput(data: any): any {
  const str = JSON.stringify(data);
  if (str.length <= 2000) return data;
  // Store only the first-level keys and their types
  if (typeof data === "object" && data !== null) {
    const summary: Record<string, string> = { _truncated: "true" };
    for (const [key, val] of Object.entries(data)) {
      summary[key] = Array.isArray(val)
        ? `array[${val.length}]`
        : typeof val;
    }
    return summary;
  }
  return { _truncated: "true", _length: str.length };
}
