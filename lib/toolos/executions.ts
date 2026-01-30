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
