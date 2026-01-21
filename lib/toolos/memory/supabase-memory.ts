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
  "tool_versions",
];

function toAdapterError(err: unknown, tables: string[], fallback: string) {
  const missing = getMissingMemoryTableError(err, tables);
  if (missing) return missing;
  const message = err instanceof Error ? err.message : fallback;
  if (err) {
    console.error("[MemoryWriteFailed]", { tables, error: err });
  }
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
    const code = typeof (err as any)?.code === "string" ? (err as any).code : undefined;
    if (code === "23502" || code === "42P10") {
      throw err;
    }
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

async function resolveOrgOwnerId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orgId: string,
) {
  const { data, error } = await (supabase.from("memberships") as any)
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve org owner: ${error.message}`);
  }
  if (!data?.user_id) {
    throw new Error("Missing org owner for tool memory write");
  }
  return data.user_id as string;
}

async function resolveToolOwnerId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  toolId: string,
) {
  const { data, error } = await (supabase.from("projects") as any)
    .select("org_id")
    .eq("id", toolId)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to resolve tool org: ${error.message}`);
  }
  if (!data?.org_id) {
    throw new Error("Missing org for tool memory write");
  }
  return await resolveOrgOwnerId(supabase, data.org_id as string);
}

async function resolveOwnerIdForScope(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  scope: Extract<MemoryScope, { type: "tool" | "tool_user" | "tool_org" }>,
) {
  if (scope.type === "tool_user") {
    return scope.userId;
  }
  if (scope.type === "tool_org") {
    return await resolveOrgOwnerId(supabase, scope.orgId);
  }
  return await resolveToolOwnerId(supabase, scope.toolId);
}

function buildToolPayload(
  scope: Extract<MemoryScope, { type: "tool" | "tool_user" | "tool_org" }>,
  namespace: string,
  key: string,
  value: any,
  ownerId: string,
) {
  if (scope.type === "tool") {
    return {
      tool_id: scope.toolId,
      org_id: null,
      user_id: null,
      owner_id: ownerId,
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
      owner_id: ownerId,
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
    owner_id: ownerId,
    namespace,
    key,
    value,
    updated_at: new Date().toISOString(),
  };
}

function resolveToolConflictTarget(scope: Extract<MemoryScope, { type: "tool" | "tool_user" | "tool_org" }>) {
  return "tool_id,namespace,key";
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
  const adapter: MemoryAdapter = {
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
      if (scope.type === "tool_org" && namespace === "tool_builder") {
        if (key === "lifecycle_state") {
          return await queryWithServerFallback(
            async (supabase) => {
              const { data, error } = await (supabase.from("tool_lifecycle_state") as any)
                .select("state, data")
                .eq("tool_id", scope.toolId)
                .eq("key", "lifecycle")
                .maybeSingle();
              if (error) throw error;
              const storedState = data?.data?.state ?? data?.state ?? data?.data ?? null;
              return storedState;
            },
            async (supabase) => {
              const { data, error } = await (supabase.from("tool_lifecycle_state") as any)
                .select("state, data")
                .eq("tool_id", scope.toolId)
                .eq("key", "lifecycle")
                .maybeSingle();
              if (error) throw toAdapterError(error, ["tool_lifecycle_state"], "Failed to load lifecycle state");
              const storedState = data?.data?.state ?? data?.state ?? data?.data ?? null;
              return storedState;
            },
          );
        }
        if (key === "build_logs") {
          return await queryWithServerFallback(
            async (supabase) => {
              const { data, error } = await (supabase.from("tool_build_logs") as any)
                .select("logs")
                .eq("tool_id", scope.toolId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (error) throw error;
              return data?.logs ?? null;
            },
            async (supabase) => {
              const { data, error } = await (supabase.from("tool_build_logs") as any)
                .select("logs")
                .eq("tool_id", scope.toolId)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              if (error) throw toAdapterError(error, ["tool_build_logs"], "Failed to load build logs");
              return data?.logs ?? null;
            },
          );
        }
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
          const payload = {
            tool_id: scope.toolId,
            key: "lifecycle",
            state: typeof value === "string" ? value : value?.state ?? "ACTIVE",
            data: value,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (!payload.key) {
            throw new Error("Lifecycle memory write attempted without key");
          }
          if (!payload.state) {
            throw new Error("Lifecycle memory write attempted without state");
          }
          await queryWithServerFallback(
            async (supabase) => {
              const { error } = await (supabase.from("tool_lifecycle_state") as any).upsert(
                payload,
                { onConflict: "tool_id" }
              );
              if (error) {
                console.error("[MemoryWriteFailed]", { table: "tool_lifecycle_state", payload, error });
                throw error;
              }
            },
            async (supabase) => {
              const { error } = await (supabase.from("tool_lifecycle_state") as any).upsert(
                payload,
                { onConflict: "tool_id" }
              );
              if (error) {
                console.error("[MemoryWriteFailed]", { table: "tool_lifecycle_state", payload, error });
                throw toAdapterError(error, ["tool_lifecycle_state"], "Failed to save lifecycle state");
              }
            }
          );
          return;
        }
        if (key === "build_logs") {
          const buildId = typeof value === "object" && value !== null ? (value as any).buildId : undefined;
          if (!buildId) {
            throw new Error("build_id missing for tool_build_logs");
          }
          const payload = {
            tool_id: scope.toolId,
            build_id: buildId,
            logs: Array.isArray(value) ? value : Array.isArray(value?.logs) ? value.logs : [value?.logs ?? value],
            created_at: new Date().toISOString(),
          };
          await queryWithServerFallback(
            async (supabase) => {
              const { error } = await (supabase.from("tool_build_logs") as any).upsert(
                payload,
                { onConflict: "tool_id,build_id" }
              );
              if (error) {
                console.error("[MemoryWriteFailed]", { table: "tool_build_logs", payload, error });
                throw error;
              }
            },
            async (supabase) => {
              const { error } = await (supabase.from("tool_build_logs") as any).upsert(
                payload,
                { onConflict: "tool_id,build_id" }
              );
              if (error) {
                console.error("[MemoryWriteFailed]", { table: "tool_build_logs", payload, error });
                throw toAdapterError(error, ["tool_build_logs"], "Failed to save build logs");
              }
            }
          );
          return;
        }
      }

      const supabase = createSupabaseAdminClient();
      const ownerId = await resolveOwnerIdForScope(supabase, scope);
      const payload = buildToolPayload(scope, namespace, key, value, ownerId);
      const onConflict = resolveToolConflictTarget(scope);
      await queryWithServerFallback(
        async (supabase) => {
          const { error } = await (supabase.from("tool_memory") as any).upsert(payload, { onConflict });
          if (error) {
            console.error("[MemoryWriteFailed]", { table: "tool_memory", payload, error });
            throw error;
          }
        },
        async (supabase) => {
          const { error } = await (supabase.from("tool_memory") as any).upsert(payload, { onConflict });
          if (error) {
            console.error("[MemoryWriteFailed]", { table: "tool_memory", payload, error });
            throw toAdapterError(error, ["tool_memory"], "Failed to save tool memory");
          }
        },
      );
    },
    async delete(params: MemoryDeleteParams) {
      const { scope, namespace, key } = params;
      if (scope.type === "tool_org" && namespace === "tool_builder") {
        if (key === "lifecycle_state") {
          await queryWithServerFallback(
            async (supabase) => {
              const { error } = await (supabase.from("tool_lifecycle_state") as any)
                .delete()
                .eq("tool_id", scope.toolId)
                .eq("key", "lifecycle")
              ;
              if (error) throw error;
            },
            async (supabase) => {
              const { error } = await (supabase.from("tool_lifecycle_state") as any)
                .delete()
                .eq("tool_id", scope.toolId)
                .eq("key", "lifecycle")
              ;
              if (error) {
                throw toAdapterError(error, ["tool_lifecycle_state"], "Failed to delete lifecycle state");
              }
            },
          );
          return;
        }
        if (key === "build_logs") {
          await queryWithServerFallback(
            async (supabase) => {
              const { error } = await (supabase.from("tool_build_logs") as any)
                .delete()
                .eq("tool_id", scope.toolId);
              if (error) throw error;
            },
            async (supabase) => {
              const { error } = await (supabase.from("tool_build_logs") as any)
                .delete()
                .eq("tool_id", scope.toolId);
              if (error) {
                throw toAdapterError(error, ["tool_build_logs"], "Failed to delete build logs");
              }
            },
          );
          return;
        }
      }
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
  if (typeof adapter.get !== "function") {
    throw new Error("Memory adapter misconfigured: get() missing");
  }
  if (typeof adapter.set !== "function") {
    throw new Error("Memory adapter misconfigured: set() missing");
  }
  if (typeof adapter.delete !== "function") {
    throw new Error("Memory adapter misconfigured: delete() missing");
  }
  return adapter;
}

export async function ensureSupabaseMemoryTables() {
  const supabase = createSupabaseAdminClient();
  const requiredSelects: Record<string, string> = {
    session_memory: "session_id, namespace, key, value, updated_at",
    tool_memory: "tool_id, namespace, key, value, owner_id, updated_at",
    user_memory: "user_id, namespace, key, value, updated_at",
    org_memory: "org_id, namespace, key, value, updated_at",
    tool_lifecycle_state: "id, tool_id, key, state, data, created_at, updated_at",
    tool_build_logs: "id, tool_id, build_id, logs, created_at",
    tool_versions: "id, tool_id, org_id, status, name, purpose, tool_spec, compiled_tool, intent_schema, build_hash, diff, created_by",
  };

  const errors: string[] = [];
  for (const table of MEMORY_TABLES) {
    const select = requiredSelects[table] ?? "id";
    const { error } = await (supabase.from(table as any) as any).select(select).limit(1);
    if (error) {
      const missingError = getMissingMemoryTableError(error, [table]);
      if (missingError) {
        errors.push(`${table} missing`);
        continue;
      }
      console.error("[MemorySchemaCheckFailed]", { table, error });
      errors.push(`${table} schema error: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Supabase schema validation failed: ${errors.join("; ")}`);
  }

  return { missingTables: [] as string[] };
}
