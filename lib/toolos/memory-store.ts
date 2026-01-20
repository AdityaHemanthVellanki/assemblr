import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadToolMemory(params: {
  toolId: string;
  orgId: string;
  namespace: string;
  key: string;
  userId?: string | null;
}) {
  const { toolId, orgId, namespace, key, userId } = params;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase.from("tool_memory") as any)
      .select("value")
      .eq("tool_id", toolId)
      .eq("org_id", orgId)
      .eq("namespace", namespace)
      .eq("key", key)
      .eq("user_id", userId ?? null)
      .maybeSingle();
    if (error) {
      if (error.message?.includes("tool_memory")) {
        return await loadFallbackMemory(toolId, orgId, namespace, key, userId ?? null);
      }
      throw error;
    }
    return data?.value ?? null;
  } catch (err) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await (supabase.from("tool_memory") as any)
      .select("value")
      .eq("tool_id", toolId)
      .eq("org_id", orgId)
      .eq("namespace", namespace)
      .eq("key", key)
      .eq("user_id", userId ?? null)
      .maybeSingle();
    if (error) {
      if (error.message?.includes("tool_memory")) {
        return await loadFallbackMemory(toolId, orgId, namespace, key, userId ?? null);
      }
      throw new Error(`Failed to load tool memory: ${error.message}`);
    }
    return data?.value ?? null;
  }
}

export async function saveToolMemory(params: {
  toolId: string;
  orgId: string;
  namespace: string;
  key: string;
  value: any;
  userId?: string | null;
}) {
  const { toolId, orgId, namespace, key, value, userId } = params;
  const payload = {
    tool_id: toolId,
    org_id: orgId,
    namespace,
    key,
    value,
    user_id: userId ?? null,
    updated_at: new Date().toISOString(),
  };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase.from("tool_memory") as any).upsert(payload, {
      onConflict: "org_id,tool_id,namespace,key,user_id",
    });
    if (error) {
      if (error.message?.includes("tool_memory")) {
        await saveFallbackMemory(toolId, orgId, namespace, key, value, userId ?? null);
        return;
      }
      throw error;
    }
  } catch (err) {
    const supabase = createSupabaseAdminClient();
    const { error } = await (supabase.from("tool_memory") as any).upsert(payload, {
      onConflict: "org_id,tool_id,namespace,key,user_id",
    });
    if (error) {
      if (error.message?.includes("tool_memory")) {
        await saveFallbackMemory(toolId, orgId, namespace, key, value, userId ?? null);
        return;
      }
      throw new Error(`Failed to save tool memory: ${error.message}`);
    }
  }
}

async function loadFallbackMemory(
  toolId: string,
  orgId: string,
  namespace: string,
  key: string,
  userId: string | null,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("spec")
    .eq("id", toolId)
    .eq("org_id", orgId)
    .single();
  if (error || !data?.spec) {
    throw new Error(`Failed to load fallback memory: ${error?.message ?? "missing spec"}`);
  }
  const spec = data.spec as Record<string, any>;
  const store = (spec.runtimeMemory as Record<string, any>) ?? {};
  const space = store[namespace] ?? {};
  const scopeKey = userId ?? "tool";
  return space?.[scopeKey]?.[key] ?? null;
}

async function saveFallbackMemory(
  toolId: string,
  orgId: string,
  namespace: string,
  key: string,
  value: any,
  userId: string | null,
) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("spec")
    .eq("id", toolId)
    .eq("org_id", orgId)
    .single();
  if (error || !data?.spec) {
    throw new Error(`Failed to load fallback spec: ${error?.message ?? "missing spec"}`);
  }
  const spec = data.spec as Record<string, any>;
  const runtimeMemory = (spec.runtimeMemory as Record<string, any>) ?? {};
  const scopeKey = userId ?? "tool";
  const namespaceMem = runtimeMemory[namespace] ?? {};
  const scopedMem = namespaceMem[scopeKey] ?? {};
  const nextRuntime = {
    ...runtimeMemory,
    [namespace]: {
      ...namespaceMem,
      [scopeKey]: { ...scopedMem, [key]: value },
    },
  };
  const nextSpec = { ...spec, runtimeMemory: nextRuntime };
  const { error: updateError } = await supabase
    .from("projects")
    .update({ spec: nextSpec })
    .eq("id", toolId)
    .eq("org_id", orgId);
  if (updateError) {
    throw new Error(`Failed to save fallback memory: ${updateError.message}`);
  }
}
