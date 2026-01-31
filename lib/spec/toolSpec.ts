import { TOOL_SPEC_VERSION, ToolSystemSpecSchema, type ToolSystemSpec } from "@/lib/toolos/spec";
import { createHash } from "crypto";

export type ToolSpec = ToolSystemSpec;

export type ToolSpecParseResult =
  | { ok: true; spec: ToolSpec }
  | { ok: false; error: string };

export type ToolSpecNormalizeResult =
  | { ok: true; spec: ToolSpec }
  | { ok: false; error: string };

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => (item === undefined || typeof item === "function" || typeof item === "symbol" ? "null" : stableStringify(item)))
      .join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(
        ([, val]) => !(val === undefined || typeof val === "function" || typeof val === "symbol"),
      )
      .sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries
      .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeSpecHash(spec: ToolSpec): string {
  return createHash("sha256").update(stableStringify(spec)).digest("hex");
}

function extractSingleJsonObject(raw: string): ToolSpecNormalizeResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "empty response" };
  }

  const fenceMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  let payload = trimmed;
  if (fenceMatches.length > 1) {
    return { ok: false, error: "Cannot coerce the result to a single JSON object" };
  }
  if (fenceMatches.length === 1) {
    payload = fenceMatches[0]?.[1]?.trim() ?? "";
    if (!payload) {
      return { ok: false, error: "empty JSON block" };
    }
  }

  const firstBrace = payload.indexOf("{");
  if (firstBrace < 0) {
    return { ok: false, error: "non-JSON response" };
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIndex = -1;

  for (let i = firstBrace; i < payload.length; i += 1) {
    const ch = payload[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      endIndex = i;
      break;
    }
  }

  if (endIndex < 0) {
    return { ok: false, error: "unterminated JSON object" };
  }

  const jsonText = payload.slice(firstBrace, endIndex + 1);
  const trailing = payload.slice(endIndex + 1).trim();
  if (trailing.length > 0) {
    return { ok: false, error: "Cannot coerce the result to a single JSON object" };
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "JSON root must be an object" };
    }
    const validated = ToolSystemSpecSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, error: validated.error.message };
    }
    return { ok: true, spec: validated.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid JSON";
    return { ok: false, error: message };
  }
}

export function normalizeToolSpec(
  raw: unknown,
  options?: { sourcePrompt?: string; enforceVersion?: boolean },
): ToolSpecNormalizeResult {
  let candidate: unknown = raw;

  if (typeof raw === "string") {
    const extracted = extractSingleJsonObject(raw);
    if (!extracted.ok) {
      return extracted;
    }
    candidate = extracted.spec;
  }

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return { ok: false, error: "Tool spec must be a JSON object" };
  }

  const normalized = {
    ...(candidate as Record<string, unknown>),
    description:
      typeof (candidate as any).description === "string" && (candidate as any).description.length > 0
        ? (candidate as any).description
        : typeof (candidate as any).purpose === "string" && (candidate as any).purpose.length > 0
          ? (candidate as any).purpose
          : "Tool description",
    spec_version:
      typeof (candidate as any).spec_version === "number"
        ? (candidate as any).spec_version
        : TOOL_SPEC_VERSION,
    version:
      typeof (candidate as any).version === "number"
        ? (candidate as any).version
        : typeof (candidate as any).spec_version === "number"
          ? (candidate as any).spec_version
          : TOOL_SPEC_VERSION,
    created_at:
      typeof (candidate as any).created_at === "string" && (candidate as any).created_at.length > 0
        ? (candidate as any).created_at
        : new Date().toISOString(),
    source_prompt:
      typeof (candidate as any).source_prompt === "string" && (candidate as any).source_prompt.length > 0
        ? (candidate as any).source_prompt
        : options?.sourcePrompt,
    memory_model:
      typeof (candidate as any).memory_model === "object" && (candidate as any).memory_model
        ? (candidate as any).memory_model
        : (candidate as any).memory,
    confidence_level:
      typeof (candidate as any).confidence_level === "string"
        ? (candidate as any).confidence_level
        : "medium",
  };

  if (!normalized.source_prompt) {
    return { ok: false, error: "Missing source_prompt for ToolSpec" };
  }

  if (options?.enforceVersion && normalized.spec_version < TOOL_SPEC_VERSION) {
    return { ok: false, error: "ToolSpec version is out of date" };
  }

  const validated = ToolSystemSpecSchema.safeParse(normalized);
  if (!validated.success) {
    return { ok: false, error: validated.error.message };
  }
  return { ok: true, spec: validated.data };
}

export function parseToolSpec(input: unknown): ToolSpecParseResult {
  const result = ToolSystemSpecSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  const specVersion = typeof result.data.spec_version === "number" ? result.data.spec_version : 0;
  if (specVersion < TOOL_SPEC_VERSION) {
    return { ok: false, error: "ToolSpec version is out of date" };
  }
  if (!result.data.source_prompt || !result.data.created_at) {
    return { ok: false, error: "ToolSpec metadata missing" };
  }
  return { ok: true, spec: result.data };
}

export function hasMinimalToolSpecFields(input: unknown): boolean {
  const result = ToolSystemSpecSchema.safeParse(input);
  if (!result.success) return false;
  const spec = result.data;
  return Boolean(spec.id && spec.name && spec.purpose);
}

export function createEmptyToolSpec(input?: {
  id?: string;
  name?: string;
  purpose?: string;
  description?: string;
  sourcePrompt?: string;
}): ToolSpec {
  const name = input?.name?.trim() || "Tool";
  const purpose = input?.purpose?.trim() || name;
  const description = input?.description?.trim() || purpose;
  const sourcePrompt = input?.sourcePrompt?.trim() || purpose;
  const now = new Date().toISOString();
  const id =
    input?.id ??
    (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `tool_${Date.now()}`);

  const memorySchema = {
    observations: [],
    aggregates: {},
    decay: { halfLifeDays: 14 },
  };
  return {
    id,
    name,
    description,
    purpose,
    version: TOOL_SPEC_VERSION,
    spec_version: TOOL_SPEC_VERSION,
    created_at: now,
    source_prompt: sourcePrompt,
    entities: [],
    actionGraph: { nodes: [], edges: [] },
    state: { initial: {}, reducers: [], graph: { nodes: [], edges: [] } },
    actions: [],
    workflows: [],
    triggers: [],
    views: [],
    derived_entities: [],
    query_plans: [],
    permissions: { roles: [], grants: [] },
    integrations: [],
    memory: {
      tool: { namespace: id, retentionDays: 30, schema: memorySchema },
      user: { namespace: id, retentionDays: 30, schema: memorySchema },
    },
    memory_model: {
      tool: { namespace: id, retentionDays: 30, schema: memorySchema },
      user: { namespace: id, retentionDays: 30, schema: memorySchema },
    },
    confidence_level: "medium",
  };
}
