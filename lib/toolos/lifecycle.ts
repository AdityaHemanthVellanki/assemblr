import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type SnapshotRecords } from "@/lib/toolos/materialization";
import { buildDefaultViewSpec } from "@/lib/toolos/view-renderer";

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

  const resolvedViewSpec =
    status === "READY" && !view_spec && data_snapshot
      ? buildDefaultViewSpec(data_snapshot)
      : view_spec;

  if (resolvedViewSpec) {
    updatePayload.view_spec = resolvedViewSpec;
    updatePayload.view_ready = true;
  } else if (typeof view_ready === "boolean") {
    updatePayload.view_ready = view_ready;
  }

  if (data_snapshot) {
    console.log("[FINALIZE] Writing data snapshot", { toolId, snapshotSize: JSON.stringify(data_snapshot).length });
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
