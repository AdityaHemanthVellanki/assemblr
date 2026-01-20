import "server-only";

import type { MemoryAdapter, MemoryDeleteParams, MemoryReadParams, MemoryScope, MemoryWriteParams } from "./memory-adapter";

const STORE = new Map<string, any>();

function scopeKey(scope: MemoryScope) {
  if (scope.type === "session") return `session:${scope.sessionId}`;
  if (scope.type === "tool") return `tool:${scope.toolId}`;
  if (scope.type === "tool_user") return `tool_user:${scope.toolId}:${scope.userId}`;
  if (scope.type === "tool_org") return `tool_org:${scope.toolId}:${scope.orgId}`;
  if (scope.type === "user") return `user:${scope.userId}`;
  return `org:${scope.orgId}`;
}

function entryKey(params: MemoryReadParams | MemoryWriteParams | MemoryDeleteParams) {
  return `${scopeKey(params.scope)}|${params.namespace}|${params.key}`;
}

export function createEphemeralMemoryAdapter(): MemoryAdapter {
  return {
    async get(params: MemoryReadParams) {
      return STORE.get(entryKey(params)) ?? null;
    },
    async set(params: MemoryWriteParams) {
      STORE.set(entryKey(params), params.value);
    },
    async delete(params: MemoryDeleteParams) {
      STORE.delete(entryKey(params));
    },
  };
}
