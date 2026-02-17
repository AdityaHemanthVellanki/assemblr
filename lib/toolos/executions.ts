import { createHash, randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type ExecutionStatus =
  | "created"
  | "awaiting_integration"
  | "compiling"
  | "compiled"
  | "executing"
  | "completed"
  | "failed";

export type PromptExecution = {
  id: string;
  userId: string;
  orgId: string;
  toolId: string;
  chatId: string;
  promptId: string | null;
  prompt: string;
  promptHash: string;
  normalizedPrompt: string;
  status: ExecutionStatus;
  toolVersionId: string | null;
  requiredIntegrations: string[];
  missingIntegrations: string[];
  resumeId: string | null;
  error: string | null;
  lockToken: string | null;
  lockAcquiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ExecutionRow = {
  id: string;
  user_id: string;
  org_id: string;
  tool_id: string;
  chat_id: string;
  prompt_id: string | null;
  prompt: string;
  prompt_hash: string;
  normalized_prompt: string;
  status: ExecutionStatus;
  tool_version_id: string | null;
  required_integrations: string[] | null;
  missing_integrations: string[] | null;
  resume_id: string | null;
  error: string | null;
  lock_token: string | null;
  lock_acquired_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ExecutionRow): PromptExecution {
  return {
    id: row.id,
    userId: row.user_id,
    orgId: row.org_id,
    toolId: row.tool_id,
    chatId: row.chat_id,
    promptId: row.prompt_id,
    prompt: row.prompt,
    promptHash: row.prompt_hash,
    normalizedPrompt: row.normalized_prompt,
    status: row.status,
    toolVersionId: row.tool_version_id,
    requiredIntegrations: row.required_integrations ?? [],
    missingIntegrations: row.missing_integrations ?? [],
    resumeId: row.resume_id,
    error: row.error,
    lockToken: row.lock_token,
    lockAcquiredAt: row.lock_acquired_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ").toLowerCase();
}

export function computePromptHash(toolId: string, prompt: string) {
  const normalized = normalizePrompt(prompt);
  return createHash("sha256").update(`${toolId}:${normalized}`).digest("hex");
}

export async function getExecutionById(executionId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await (supabase.from("prompt_executions") as any)
      .select("*")
      .eq("id", executionId)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data ? mapRow(data as ExecutionRow) : null;
  } catch (err: any) {
    throw new Error(`Execution persistence failed: ${err?.message ?? "unknown error"}`);
  }
}

export async function findExecutionByPromptHash(params: { toolId: string; promptHash: string }) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await (supabase.from("prompt_executions") as any)
      .select("*")
      .eq("tool_id", params.toolId)
      .eq("prompt_hash", params.promptHash)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data ? mapRow(data as ExecutionRow) : null;
  } catch (err: any) {
    throw new Error(`Execution persistence failed: ${err?.message ?? "unknown error"}`);
  }
}

export async function createExecution(params: {
  orgId: string;
  toolId: string;
  chatId: string;
  userId: string;
  promptId?: string | null;
  prompt: string;
  resumeId?: string | null;
  requiredIntegrations?: string[];
  missingIntegrations?: string[];
}) {
  try {
    const supabase = createSupabaseAdminClient();
    const normalizedPrompt = normalizePrompt(params.prompt);
    const promptHash = computePromptHash(params.toolId, normalizedPrompt);
    const payload = {
      org_id: params.orgId,
      tool_id: params.toolId,
      chat_id: params.chatId,
      user_id: params.userId,
      prompt: params.prompt,
      prompt_id: params.promptId ?? null,
      resume_id: params.resumeId ?? null,
      prompt_hash: promptHash,
      normalized_prompt: normalizedPrompt,
      status: "created",
      required_integrations: params.requiredIntegrations ?? [],
      missing_integrations: params.missingIntegrations ?? [],
    };
    const { data, error } = await (supabase.from("prompt_executions") as any)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      const existing = await findExecutionByPromptHash({ toolId: params.toolId, promptHash });
      if (existing) return existing;
      throw new Error(error.message);
    }
    return mapRow(data as ExecutionRow);
  } catch (err: any) {
    throw new Error(`Execution persistence failed: ${err?.message ?? "unknown error"}`);
  }
}

export async function updateExecution(
  executionId: string,
  updates: Partial<{
    status: ExecutionStatus;
    toolVersionId: string | null;
    requiredIntegrations: string[];
    missingIntegrations: string[];
    lockToken: string | null;
    lockAcquiredAt: string | null;
    error: string | null;
    resumeId: string | null;
  }>
) {
  try {
    const supabase = createSupabaseAdminClient();
    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.status) payload.status = updates.status;
    if (updates.toolVersionId !== undefined) payload.tool_version_id = updates.toolVersionId;
    if (updates.requiredIntegrations) payload.required_integrations = updates.requiredIntegrations;
    if (updates.missingIntegrations) payload.missing_integrations = updates.missingIntegrations;
    if (updates.lockToken !== undefined) payload.lock_token = updates.lockToken;
    if (updates.lockAcquiredAt !== undefined) payload.lock_acquired_at = updates.lockAcquiredAt;
    if (updates.error !== undefined) payload.error = updates.error;
    if (updates.resumeId !== undefined) payload.resume_id = updates.resumeId;
    const { data, error } = await (supabase.from("prompt_executions") as any)
      .update(payload)
      .eq("id", executionId)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new Error(error.message);
    }
    return data ? mapRow(data as ExecutionRow) : null;
  } catch (err: any) {
    throw new Error(`Execution persistence failed: ${err?.message ?? "unknown error"}`);
  }
}

export async function markExecutionCompiling(executionId: string) {
  return updateExecution(executionId, { status: "compiling" });
}

export async function markExecutionFailed(executionId: string, errorMessage: string) {
  return updateExecution(executionId, {
    status: "failed",
    error: errorMessage,
  });
}

export async function acquireExecutionLock(executionId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const lockToken = randomUUID();
    const { data, error } = await (supabase.from("prompt_executions") as any)
      .update({
        lock_token: lockToken,
        lock_acquired_at: new Date().toISOString(),
        status: "compiling",
      })
      .eq("id", executionId)
      .eq("status", "created")
      .is("lock_token", null)
      .select("*")
      .single();

    if (error || !data) {
      throw new Error("Execution already locked or already executed");
    }

    return mapRow(data as ExecutionRow);
  } catch (err: any) {
    throw new Error(`Failed to acquire execution lock: ${err?.message ?? "unknown error"}`);
  }
}

export async function completeExecution(executionId: string) {
  return updateExecution(executionId, {
    status: "completed",
    lockToken: null,
  });
}

/**
 * In-memory build steps store — keyed by toolId for fast polling lookups.
 * Works even when the DB column doesn't exist yet.
 * Entries auto-expire after 5 minutes to prevent memory leaks.
 */
const _inMemoryBuildSteps = new Map<string, { steps: any[]; executionId: string; updatedAt: number }>();
const BUILD_STEPS_TTL_MS = 5 * 60 * 1000;

function cleanExpiredBuildSteps() {
  const now = Date.now();
  for (const [key, value] of _inMemoryBuildSteps) {
    if (now - value.updatedAt > BUILD_STEPS_TTL_MS) {
      _inMemoryBuildSteps.delete(key);
    }
  }
}

/**
 * Associate an execution with a toolId for in-memory lookups.
 */
export function registerBuildExecution(toolId: string, executionId: string) {
  _inMemoryBuildSteps.set(toolId, { steps: [], executionId, updatedAt: Date.now() });
}

/**
 * Fire-and-forget persist build steps.
 * Always writes to in-memory store; also attempts DB persist if column exists.
 */
let _buildStepsColumnExists = true;

export function persistBuildSteps(executionId: string, steps: any[]) {
  if (!executionId) return;

  // Always update in-memory store (keyed by toolId via executionId lookup)
  for (const [toolId, entry] of _inMemoryBuildSteps) {
    if (entry.executionId === executionId) {
      entry.steps = steps;
      entry.updatedAt = Date.now();
      break;
    }
  }

  // Also try DB persist if column exists
  if (_buildStepsColumnExists) {
    const supabase = createSupabaseAdminClient();
    (supabase.from("prompt_executions") as any)
      .update({ build_steps: steps, updated_at: new Date().toISOString() })
      .eq("id", executionId)
      .then(({ error }: any) => {
        if (error?.message?.includes("build_steps")) {
          _buildStepsColumnExists = false;
        }
      });
  }
}

/**
 * Get current build steps for an execution.
 */
export async function getBuildSteps(executionId: string): Promise<any[]> {
  // Check in-memory first
  for (const entry of _inMemoryBuildSteps.values()) {
    if (entry.executionId === executionId && entry.steps.length > 0) {
      return entry.steps;
    }
  }
  if (!_buildStepsColumnExists) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("prompt_executions") as any)
    .select("build_steps")
    .eq("id", executionId)
    .maybeSingle();
  if (error || !data) return [];
  return Array.isArray(data.build_steps) ? data.build_steps : [];
}

/**
 * Clear build steps for a tool (call when execution completes).
 */
export function clearBuildSteps(toolId: string) {
  _inMemoryBuildSteps.delete(toolId);
  cleanExpiredBuildSteps();
}

/**
 * Get the latest active execution for a tool (for polling build progress).
 */
export async function getActiveExecution(toolId: string): Promise<{ id: string; status: string; buildSteps: any[] } | null> {
  // Check in-memory store first
  const memEntry = _inMemoryBuildSteps.get(toolId);
  if (memEntry && memEntry.steps.length > 0 && (Date.now() - memEntry.updatedAt < BUILD_STEPS_TTL_MS)) {
    return {
      id: memEntry.executionId,
      status: "compiling",
      buildSteps: memEntry.steps,
    };
  }

  // Fall back to DB
  const supabase = createSupabaseAdminClient();
  const selectCols = _buildStepsColumnExists ? "id, status, build_steps" : "id, status";
  const { data, error } = await (supabase.from("prompt_executions") as any)
    .select(selectCols)
    .eq("tool_id", toolId)
    .in("status", ["compiling", "executing", "created"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    status: data.status,
    buildSteps: Array.isArray(data.build_steps) ? data.build_steps : [],
  };
}
