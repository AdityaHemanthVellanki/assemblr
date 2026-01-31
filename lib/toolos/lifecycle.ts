import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createEmptyToolSpec } from "@/lib/toolos/spec";
import { computeSpecHash } from "@/lib/spec/toolSpec";
import { createHash, randomUUID } from "crypto";
import { type SnapshotRecords } from "@/lib/toolos/materialization";

export type FinalizeToolExecutionInput = {
  toolId: string;
  status: "READY" | "FAILED";
  errorMessage?: string | null;
  environment?: Record<string, any>;
  view_spec?: Record<string, any> | null;
  view_ready?: boolean;
  data_snapshot?: SnapshotRecords | null;
  data_ready?: boolean;
  data_fetched_at?: string | null;
};

function normalizeSnapshotRecords(snapshot?: SnapshotRecords | null): SnapshotRecords {
  const base = snapshot ?? { state: {}, actions: {}, integrations: {} };
  const state = base && typeof base.state === "object" && base.state ? base.state : {};
  const actions = base && typeof base.actions === "object" && base.actions ? base.actions : {};
  const integrations =
    base && typeof base.integrations === "object" && base.integrations ? base.integrations : {};
  return { state, actions, integrations };
}

/**
 * SINGLE TERMINAL WRITE BARRIER
 * 
 * This function is the ONLY allowed place to transition a tool to a terminal state (READY/FAILED).
 * It enforces:
 * 1. Atomic update of projects table
 * 2. Invariant logging
 * 3. Throw on DB failure
 */
export async function finalizeToolExecution(input: FinalizeToolExecutionInput): Promise<void> {
  const {
    toolId,
    status,
    errorMessage,
    environment,
    view_spec,
    view_ready,
    data_snapshot,
    data_ready,
    data_fetched_at,
  } = input;
  const supabase = createSupabaseAdminClient();
  
  console.log(`[Lifecycle] Tool finalized: ${status}`, { toolId, errorMessage, lifecycle_done: true });
  console.log("[FINALIZE] FINALIZING TOOL", toolId);

  const updatePayload: any = {
    status,
    error_message: status === "FAILED" ? errorMessage ?? "Unknown error" : null,
    finalized_at: new Date().toISOString(),
    lifecycle_done: true,
  };

  if (status === "READY") {
    const normalizedSnapshot = normalizeSnapshotRecords(data_snapshot);
    if (!view_spec) {
      throw new Error("View spec required but missing");
    }
    const resolvedViewSpec = view_spec;
    console.log("[FINALIZE] Writing data snapshot", {
      toolId,
      snapshotSize: JSON.stringify(normalizedSnapshot).length,
    });
    updatePayload.data_snapshot = normalizedSnapshot;
    updatePayload.data_ready = true;
    updatePayload.data_fetched_at = data_fetched_at ?? new Date().toISOString();
    updatePayload.view_spec = resolvedViewSpec;
    updatePayload.view_ready = true;
  } else {
    if (view_spec) {
      updatePayload.view_spec = view_spec;
      updatePayload.view_ready = true;
    } else if (typeof view_ready === "boolean") {
      updatePayload.view_ready = view_ready;
    }

    if (data_snapshot) {
      console.log("[FINALIZE] Writing data snapshot", {
        toolId,
        snapshotSize: JSON.stringify(data_snapshot).length,
      });
      updatePayload.data_snapshot = data_snapshot;
      updatePayload.data_ready = true;
      updatePayload.data_fetched_at = data_fetched_at ?? new Date().toISOString();
    } else if (typeof data_ready === "boolean") {
      updatePayload.data_ready = data_ready;
      if (data_ready && !data_fetched_at) {
        updatePayload.data_fetched_at = new Date().toISOString();
      } else if (data_fetched_at) {
        updatePayload.data_fetched_at = data_fetched_at;
      }
    }
  }

  if (status === "READY" && environment) {
    updatePayload.environment = environment;
  }

  if (status !== "READY" && status !== "FAILED") {
    throw new Error(`[Lifecycle] Invalid terminal status: ${status}`);
  }

  const { error: dbError } = await supabase
    .from("projects")
    .update(updatePayload)
    .eq("id", toolId);

  if (dbError) {
    console.error(`[Lifecycle] DB Update Failed: ${dbError.message}`, dbError);
    throw new Error(`CRITICAL: Tool ${toolId} failed to finalize: ${dbError.message}`);
  }

  console.log("[FINALIZE] TOOL FINALIZED", toolId);
  if (updatePayload.data_ready) {
      console.log("[FINALIZE] data_ready set to true for tool", toolId);
  }
}

export async function ensureToolIdentity(params: {
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
  toolId?: string;
  orgId: string;
  userId: string;
  name?: string;
  purpose?: string;
  sourcePrompt?: string;
}) {
  const supabase = params.supabase ?? createSupabaseAdminClient();
  const toolId = params.toolId ?? randomUUID();
  const name = params.name ?? "New Tool";
  const now = new Date().toISOString();
  const spec = createEmptyToolSpec({
    id: toolId,
    name,
    purpose: params.purpose ?? name,
    sourcePrompt: params.sourcePrompt ?? params.purpose ?? name,
  });

  const { data: toolRow, error: toolError } = await (supabase.from("tools") as any)
    .upsert(
      {
        id: toolId,
        org_id: params.orgId,
        name,
        type: "tool",
        current_spec: spec,
      },
      { onConflict: "id" },
    )
    .select("id, org_id")
    .single();

  if (toolError || !toolRow) {
    throw new Error(`Fatal: failed to create tool row: ${toolError?.message || "Unknown error"}`);
  }
  if (toolRow.org_id && toolRow.org_id !== params.orgId) {
    throw new Error(`Invariant: tool ${toolId} belongs to a different org`);
  }

  const { data: projectRow, error: projectError } = await (supabase.from("projects") as any)
    .upsert(
      {
        id: toolId,
        org_id: params.orgId,
        name,
        status: "DRAFT",
        spec,
        created_at: now,
        updated_at: now,
      },
      { onConflict: "id" },
    )
    .select("id, org_id")
    .single();

  if (projectError || !projectRow) {
    throw new Error(`Fatal: failed to create project row: ${projectError?.message || "Unknown error"}`);
  }
  if (projectRow.org_id && projectRow.org_id !== params.orgId) {
    throw new Error(`Invariant: project ${toolId} belongs to a different org`);
  }

  const { data: verifyTool } = await (supabase.from("tools") as any)
    .select("id")
    .eq("id", toolId)
    .single();
  if (!verifyTool) {
    throw new Error("Invariant: tool not persisted to tools table");
  }

  const { data: verifyProject } = await (supabase.from("projects") as any)
    .select("id")
    .eq("id", toolId)
    .single();
  if (!verifyProject) {
    throw new Error("Invariant: tool not persisted to projects table");
  }

  return { toolId, spec };
}

export async function canExecuteTool(params: { toolId: string }) {
  const supabase = createSupabaseAdminClient();
  const { data: project } = await (supabase.from("projects") as any)
    .select("id, active_version_id, spec")
    .eq("id", params.toolId)
    .single();

  if (!project?.id) return { ok: false, reason: "tool_missing" };

  const { data: toolRow } = await (supabase.from("tools") as any)
    .select("id")
    .eq("id", params.toolId)
    .single();

  if (!toolRow?.id) return { ok: false, reason: "legacy_tool_missing" };

  if (!project.active_version_id) return { ok: false, reason: "active_version_missing" };

  const { data: version } = await (supabase.from("tool_versions") as any)
    .select("tool_spec, compiled_tool")
    .eq("id", project.active_version_id)
    .single();

  if (!version?.compiled_tool || !version?.tool_spec) {
    return { ok: false, reason: "compiled_artifact_missing" };
  }

  const specHash = computeSpecHash(version.tool_spec as any);
  const compiledSpecHash = (version.compiled_tool as any)?.specHash;

  if (!compiledSpecHash || compiledSpecHash !== specHash) {
    return { ok: false, reason: "compiled_hash_mismatch" };
  }

  return { ok: true, reason: "ok" };
}
