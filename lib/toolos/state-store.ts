import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadToolState(toolId: string, orgId: string): Promise<Record<string, any>> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await (supabase.from("tool_states") as any)
      .select("state")
      .eq("tool_id", toolId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      if (error.message?.includes("tool_states")) {
        return await loadFallbackState(toolId, orgId);
      }
      throw error;
    }
    return (data?.state as Record<string, any>) ?? {};
  } catch (err) {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await (supabase.from("tool_states") as any)
      .select("state")
      .eq("tool_id", toolId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      if (error.message?.includes("tool_states")) {
        return await loadFallbackState(toolId, orgId);
      }
      throw new Error(`Failed to load tool state: ${error.message}`);
    }
    return (data?.state as Record<string, any>) ?? {};
  }
}

export async function saveToolState(toolId: string, orgId: string, state: Record<string, any>) {
  const payload = {
    tool_id: toolId,
    org_id: orgId,
    state,
    updated_at: new Date().toISOString(),
  };
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await (supabase.from("tool_states") as any).upsert(payload, {
      onConflict: "org_id,tool_id",
    });
    if (error) {
      if (error.message?.includes("tool_states")) {
        await saveFallbackState(toolId, orgId, state);
        return;
      }
      throw error;
    }
  } catch (err) {
    const supabase = createSupabaseAdminClient();
    const { error } = await (supabase.from("tool_states") as any).upsert(payload, {
      onConflict: "org_id,tool_id",
    });
    if (error) {
      if (error.message?.includes("tool_states")) {
        await saveFallbackState(toolId, orgId, state);
        return;
      }
      throw new Error(`Failed to save tool state: ${error.message}`);
    }
  }
}

async function loadFallbackState(toolId: string, orgId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("spec")
    .eq("id", toolId)
    .eq("org_id", orgId)
    .single();
  if (error || !data?.spec) {
    throw new Error(`Failed to load fallback state: ${error?.message ?? "missing spec"}`);
  }
  const spec = data.spec as Record<string, any>;
  return (spec.runtimeState as Record<string, any>) ?? {};
}

async function saveFallbackState(toolId: string, orgId: string, state: Record<string, any>) {
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
  const nextSpec = { ...spec, runtimeState: state };
  const { error: updateError } = await supabase
    .from("projects")
    .update({ spec: nextSpec })
    .eq("id", toolId)
    .eq("org_id", orgId);
  if (updateError) {
    throw new Error(`Failed to save fallback state: ${updateError.message}`);
  }
}
