import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
