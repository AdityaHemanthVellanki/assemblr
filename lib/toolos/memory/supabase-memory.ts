import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  MemoryAdapter,
  MemoryAdapterError,
  MemoryDeleteParams,
  MemoryReadParams,
  MemoryScope,
  MemoryWriteParams,
  getMissingMemoryTableError,
} from "./memory-adapter";

const MEMORY_TABLES = [
  "session_memory",
  "tool_memory",
  "user_memory",
  "org_memory",
  "tool_lifecycle_state",
  "tool_build_logs",
];

function toAdapterError(err: unknown, tables: string[], fallback: string) {
  const missing = getMissingMemoryTableError(err, tables);
  if (missing) return missing;
  const message = err instanceof Error ? err.message : fallback;
  return new MemoryAdapterError("unknown", message);
}

async function queryWithServerFallback<T>(
  run: (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) => Promise<T>,
  onAdmin: (supabase: ReturnType<typeof createSupabaseAdminClient>, err?: Error) => Promise<T>,
) {
  try {
    const supabase = await createSupabaseServerClient();
    return await run(supabase);
  } catch (err) {
    const supabase = createSupabaseAdminClient();
    return await onAdmin(supabase, err as Error);
  }
}

async function loadToolMemory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  scope: Extract<MemoryScope, { type: "tool" | "tool_user" | "tool_org" }>,
  namespace: string,
  key: string,
) {
  const query = (supabase.from("tool_memory") as any)
    .select("value")
    .eq("tool_id", scope.toolId)
    .eq("namespace", namespace)
    .eq("key", key);
  if (scope.type === "tool") {
    query.is("org_id", null).is("user_id", null);
  } else if (scope.type === "tool_user") {
    query.eq("user_id", scope.userId).is("org_id", null);
  } else {
    query.eq("org_id", scope.orgId).is("user_id", null);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw toAdapterError(error, ["tool_memory"], "Failed to load tool memory");
  }
  return data?.value ?? null;
}

function buildToolPayload(
  scope: Extract<MemoryScope, { type: "tool" | "tool_user" | "tool_org" }>,
  namespace: string,
  key: string,
  value: any,
) {
  if (scope.type === "tool") {
    return {
      tool_id: scope.toolId,
      org_id: null,
      user_id: null,
      namespace,
      key,
      value,
      updated_at: new Date().toISOString(),
    };
  }
  if (scope.type === "tool_user") {
    return {
      tool_id: scope.toolId,
      org_id: null,
      user_id: scope.userId,
      namespace,
      key,
      value,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    tool_id: scope.toolId,
    org_id: scope.orgId,
    user_id: null,
    namespace,
    key,
    value,
    updated_at: new Date().toISOString(),
  };
}

function resolveToolConflictTarget(scope: Extract<MemoryScope, { type: "tool" | "tool_user" | "tool_org" }>) {
  if (scope.type === "tool") {
    return "tool_id,namespace,key";
  }
  if (scope.type === "tool_user") {
    return "tool_id,user_id,namespace,key";
  }
  return "tool_id,org_id,namespace,key";
}

async function loadSimpleMemory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: "user_memory" | "org_memory",
  idKey: "user_id" | "org_id",
  idValue: string,
  namespace: string,
  key: string,
) {
  const { data, error } = await (supabase.from(table) as any)
    .select("value")
    .eq(idKey, idValue)
    .eq("namespace", namespace)
    .eq("key", key)
    .maybeSingle();
  if (error) {
    throw toAdapterError(error, [table], `Failed to load ${table}`);
  }
  return data?.value ?? null;
}

async function saveSimpleMemory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: "user_memory" | "org_memory",
  idKey: "user_id" | "org_id",
  idValue: string,
  namespace: string,
  key: string,
  value: any,
) {
  const { error } = await (supabase.from(table) as any).upsert(
    {
      [idKey]: idValue,
      namespace,
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: `${idKey},namespace,key` },
  );
  if (error) {
    throw toAdapterError(error, [table], `Failed to save ${table}`);
  }
}

async function deleteSimpleMemory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  table: "user_memory" | "org_memory",
  idKey: "user_id" | "org_id",
  idValue: string,
  namespace: string,
  key: string,
) {
  const { error } = await (supabase.from(table) as any)
    .delete()
    .eq(idKey, idValue)
    .eq("namespace", namespace)
    .eq("key", key);
  if (error) {
    throw toAdapterError(error, [table], `Failed to delete ${table}`);
  }
}

export function createSupabaseMemoryAdapter(): MemoryAdapter {
  return {
    async get(params: MemoryReadParams) {
      const { scope, namespace, key } = params;
      if (scope.type === "session") {
        const supabase = createSupabaseAdminClient();
        const { data, error } = await (supabase.from("session_memory") as any)
          .select("value")
          .eq("session_id", scope.sessionId)
          .eq("namespace", namespace)
          .eq("key", key)
          .maybeSingle();
        if (error) {
          throw toAdapterError(error, ["session_memory"], "Failed to load session memory");
        }
        return data?.value ?? null;
      }
      if (scope.type === "user") {
        return await queryWithServerFallback(
          (supabase) => loadSimpleMemory(supabase, "user_memory", "user_id", scope.userId, namespace, key),
          (supabase) => loadSimpleMemory(supabase, "user_memory", "user_id", scope.userId, namespace, key),
        );
      }
      if (scope.type === "org") {
        return await queryWithServerFallback(
          (supabase) => loadSimpleMemory(supabase, "org_memory", "org_id", scope.orgId, namespace, key),
          (supabase) => loadSimpleMemory(supabase, "org_memory", "org_id", scope.orgId, namespace, key),
        );
      }
      return await queryWithServerFallback(
        (supabase) => loadToolMemory(supabase, scope, namespace, key),
        (supabase) => loadToolMemory(supabase, scope, namespace, key),
      );
    },
    async set(params: MemoryWriteParams) {
      const { scope, namespace, key, value } = params;
      if (scope.type === "session") {
        const supabase = createSupabaseAdminClient();
        const { error } = await (supabase.from("session_memory") as any).upsert(
          {
            session_id: scope.sessionId,
            namespace,
            key,
            value,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "session_id,namespace,key" },
        );
        if (error) {
          throw toAdapterError(error, ["session_memory"], "Failed to save session memory");
        }
        return;
      }
      if (scope.type === "user") {
        await queryWithServerFallback(
          (supabase) => saveSimpleMemory(supabase, "user_memory", "user_id", scope.userId, namespace, key, value),
          (supabase) => saveSimpleMemory(supabase, "user_memory", "user_id", scope.userId, namespace, key, value),
        );
        return;
      }
      if (scope.type === "org") {
        await queryWithServerFallback(
          (supabase) => saveSimpleMemory(supabase, "org_memory", "org_id", scope.orgId, namespace, key, value),
          (supabase) => saveSimpleMemory(supabase, "org_memory", "org_id", scope.orgId, namespace, key, value),
        );
        return;
      }

      // Specialized routing for tool builder artifacts
      if (scope.type === "tool_org" && namespace === "tool_builder") {
        if (key === "lifecycle_state") {
          await queryWithServerFallback(
            async (supabase) => {
              const { error } = await (supabase.from("tool_lifecycle_state") as any).upsert({
                tool_id: scope.toolId,
                state: typeof value === 'string' ? value : JSON.stringify(value),
                details: typeof value === 'object' ? value : null,
                updated_at: new Date().toISOString(),
              }, { onConflict: "tool_id" });
              if (error) throw error;
            },
            async (supabase) => {
              const { error } = await (supabase.from("tool_lifecycle_state") as any).upsert({
                tool_id: scope.toolId,
                state: typeof value === 'string' ? value : JSON.stringify(value),
                details: typeof value === 'object' ? value : null,
                updated_at: new Date().toISOString(),
              }, { onConflict: "tool_id" });
              if (error) throw toAdapterError(error, ["tool_lifecycle_state"], "Failed to save lifecycle state");
            }
          );
          return;
        }
        if (key === "build_logs") {
          await queryWithServerFallback(
            async (supabase) => {
              const { error } = await (supabase.from("tool_build_logs") as any).upsert({
                tool_id: scope.toolId,
                build_id: "latest", // Singleton build log for now
                logs: Array.isArray(value) ? value : [value],
                updated_at: new Date().toISOString(),
              }, { onConflict: "tool_id,build_id" });
              if (error) throw error;
            },
            async (supabase) => {
              const { error } = await (supabase.from("tool_build_logs") as any).upsert({
                tool_id: scope.toolId,
                build_id: "latest",
                logs: Array.isArray(value) ? value : [value],
                updated_at: new Date().toISOString(),
              }, { onConflict: "tool_id,build_id" });
              if (error) throw toAdapterError(error, ["tool_build_logs"], "Failed to save build logs");
            }
          );
          return;
        }
      }

      const payload = buildToolPayload(scope, namespace, key, value);
      const onConflict = resolveToolConflictTarget(scope);
      await queryWithServerFallback(
        async (supabase) => {
          const { error } = await (supabase.from("tool_memory") as any).upsert(payload, { onConflict });
          if (error) throw error;
        },
        async (supabase) => {
          const { error } = await (supabase.from("tool_memory") as any).upsert(payload, { onConflict });
          if (error) {
            throw toAdapterError(error, ["tool_memory"], "Failed to save tool memory");
          }
        },
      );
    },
    async delete(params: MemoryDeleteParams) {
      const { scope, namespace, key } = params;
      if (scope.type === "session") {
        const supabase = createSupabaseAdminClient();
        const { error } = await (supabase.from("session_memory") as any)
          .delete()
          .eq("session_id", scope.sessionId)
          .eq("namespace", namespace)
          .eq("key", key);
        if (error) {
          throw toAdapterError(error, ["session_memory"], "Failed to delete session memory");
        }
        return;
      }
      if (scope.type === "user") {
        await queryWithServerFallback(
          (supabase) => deleteSimpleMemory(supabase, "user_memory", "user_id", scope.userId, namespace, key),
          (supabase) => deleteSimpleMemory(supabase, "user_memory", "user_id", scope.userId, namespace, key),
        );
        return;
      }
      if (scope.type === "org") {
        await queryWithServerFallback(
          (supabase) => deleteSimpleMemory(supabase, "org_memory", "org_id", scope.orgId, namespace, key),
          (supabase) => deleteSimpleMemory(supabase, "org_memory", "org_id", scope.orgId, namespace, key),
        );
        return;
      }
      await queryWithServerFallback(
        async (supabase) => {
          const query = (supabase.from("tool_memory") as any)
            .delete()
            .eq("tool_id", scope.toolId)
            .eq("namespace", namespace)
            .eq("key", key);
          if (scope.type === "tool") {
            query.is("org_id", null).is("user_id", null);
          } else if (scope.type === "tool_user") {
            query.eq("user_id", scope.userId).is("org_id", null);
          } else {
            query.eq("org_id", scope.orgId).is("user_id", null);
          }
          const { error } = await query;
          if (error) throw error;
        },
        async (supabase) => {
          const query = (supabase.from("tool_memory") as any)
            .delete()
            .eq("tool_id", scope.toolId)
            .eq("namespace", namespace)
            .eq("key", key);
          if (scope.type === "tool") {
            query.is("org_id", null).is("user_id", null);
          } else if (scope.type === "tool_user") {
            query.eq("user_id", scope.userId).is("org_id", null);
          } else {
            query.eq("org_id", scope.orgId).is("user_id", null);
          }
          const { error } = await query;
          if (error) {
            throw toAdapterError(error, ["tool_memory"], "Failed to delete tool memory");
          }
        },
      );
    },
  };
}

export async function ensureSupabaseMemoryTables() {
  const supabase = createSupabaseAdminClient();
  const missing: string[] = [];
  for (const table of MEMORY_TABLES) {
    const { error } = await (supabase.from(table as any) as any).select("id").limit(1);
    if (error) {
      const missingError = getMissingMemoryTableError(error, [table]);
      if (missingError) {
        missing.push(table);
        continue;
      }
      throw toAdapterError(error, [table], "Failed to check memory tables");
    }
  }
  return { missingTables: missing };
}
