import "server-only";

import { createHash } from "crypto";
import { normalizeUUID } from "@/lib/utils";
import {
  MemoryAdapter,
  MemoryDeleteParams,
  MemoryReadParams,
  MemoryScope,
  MemoryWriteParams,
} from "@/lib/toolos/memory/memory-adapter";
import { createSupabaseMemoryAdapter, ensureSupabaseMemoryTables } from "@/lib/toolos/memory/supabase-memory";

export type { MemoryScope } from "@/lib/toolos/memory/memory-adapter";

function normalizeSessionId(sessionId: string) {
  const trimmed = sessionId.trim();
  const normalized = normalizeUUID(trimmed);
  if (normalized) return normalized;
  const hash = createHash("sha256").update(trimmed).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
}

function normalizeScope(scope: MemoryScope): MemoryScope {
  if (scope.type === "session") {
    const sessionId = typeof scope.sessionId === "string" ? scope.sessionId.trim() : "";
    if (!sessionId) {
      throw new Error("Invalid sessionId for memory scope");
    }
    return { type: "session", sessionId: normalizeSessionId(sessionId) };
  }
  if (scope.type === "tool") {
    const toolId = normalizeUUID(scope.toolId);
    if (!toolId) {
      throw new Error("Invalid toolId for memory scope");
    }
    return { type: "tool", toolId };
  }
  if (scope.type === "tool_user") {
    const toolId = normalizeUUID(scope.toolId);
    const userId = normalizeUUID(scope.userId);
    if (!toolId || !userId) {
      throw new Error("Invalid tool_user scope");
    }
    return { type: "tool_user", toolId, userId };
  }
  if (scope.type === "tool_org") {
    const toolId = normalizeUUID(scope.toolId);
    const orgId = normalizeUUID(scope.orgId);
    if (!toolId || !orgId) {
      throw new Error("Invalid tool_org scope");
    }
    return { type: "tool_org", toolId, orgId };
  }
  if (scope.type === "user") {
    const userId = normalizeUUID(scope.userId);
    if (!userId) {
      throw new Error("Invalid user scope");
    }
    return { type: "user", userId };
  }
  const orgId = normalizeUUID(scope.orgId);
  if (!orgId) {
    throw new Error("Invalid org scope");
  }
  return { type: "org", orgId };
}

let adapterPromise: Promise<MemoryAdapter> | null = null;
let adapterFactoryOverride: (() => Promise<MemoryAdapter>) | null = null;
let bootstrapPromise: Promise<void> | null = null;

function startMemoryBootstrapCheck() {
  if (bootstrapPromise) return bootstrapPromise;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("Supabase env missing for memory persistence");
  }
  bootstrapPromise = (async () => {
    await ensureSupabaseMemoryTables();
  })();
  return bootstrapPromise;
}

void startMemoryBootstrapCheck();

async function createDefaultAdapter(): Promise<MemoryAdapter> {
  await startMemoryBootstrapCheck();
  return createSupabaseMemoryAdapter();
}

async function getAdapter() {
  if (!adapterPromise) {
    adapterPromise = (adapterFactoryOverride ?? createDefaultAdapter)();
  }
  return adapterPromise;
}

export function setMemoryAdapterFactory(factory: (() => Promise<MemoryAdapter>) | null) {
  adapterFactoryOverride = factory;
  adapterPromise = null;
}

export async function loadMemory(params: MemoryReadParams) {
  const { scope, namespace, key } = params;
  const adapter = await getAdapter();
  return await adapter.get({ scope: normalizeScope(scope), namespace, key });
}

export async function saveMemory(params: MemoryWriteParams) {
  const adapter = await getAdapter();
  try {
    const normalizedScope = normalizeScope(params.scope);
    await adapter.set({ ...params, scope: normalizedScope });
  } catch (err) {
    // FIX: Memory failures must never abort tool build
    // We log the error but swallow it to ensure the build proceeds in-memory
    console.error("[MemoryPersistenceFailed] (Non-fatal)", err);
  }
}

export async function deleteMemory(params: MemoryDeleteParams) {
  const adapter = await getAdapter();
  try {
    const normalizedScope = normalizeScope(params.scope);
    await adapter.delete({ ...params, scope: normalizedScope });
  } catch (err) {
    console.error("[MemoryDeleteFailed] (Non-fatal)", err);
  }
}
