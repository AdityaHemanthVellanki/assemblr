import "server-only";

import { createHash } from "crypto";
import { normalizeUUID } from "@/lib/utils";
import {
  MemoryAdapter,
  MemoryAdapterError,
  MemoryDeleteParams,
  MemoryReadParams,
  MemoryScope,
  MemoryWriteParams,
  createFallbackMemoryAdapter,
} from "@/lib/toolos/memory/memory-adapter";
import { createEphemeralMemoryAdapter } from "@/lib/toolos/memory/ephemeral-memory";
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
    bootstrapPromise = Promise.resolve();
    return bootstrapPromise;
  }
  bootstrapPromise = (async () => {
    try {
      const { missingTables } = await ensureSupabaseMemoryTables();
      if (missingTables.length > 0) {
        console.warn(`[MemoryBootstrap] Missing memory tables: ${missingTables.join(", ")}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[MemoryBootstrap] Failed to check memory tables: ${message}`);
    }
  })();
  return bootstrapPromise;
}

void startMemoryBootstrapCheck();

async function createDefaultAdapter() {
  const primary = createSupabaseMemoryAdapter();
  const fallback = createEphemeralMemoryAdapter();
  let initialPrimaryAvailable = true;
  try {
    const { missingTables } = await ensureSupabaseMemoryTables();
    if (missingTables.length > 0) {
      initialPrimaryAvailable = false;
    }
  } catch (err) {
    if (err instanceof MemoryAdapterError && err.kind === "missing_table") {
      initialPrimaryAvailable = false;
    } else {
      initialPrimaryAvailable = false;
    }
  }
  return createFallbackMemoryAdapter({ primary, fallback, initialPrimaryAvailable });
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
  const { scope, namespace, key, value } = params;
  const adapter = await getAdapter();
  await adapter.set({ scope: normalizeScope(scope), namespace, key, value });
}

export async function deleteMemory(params: MemoryDeleteParams) {
  const { scope, namespace, key } = params;
  const adapter = await getAdapter();
  await adapter.delete({ scope: normalizeScope(scope), namespace, key });
}
