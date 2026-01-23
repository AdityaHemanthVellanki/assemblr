import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type FinalizeLifecycleInput = {
  toolId: string;
  status: "READY" | "FAILED";
  errorMessage?: string | null;
  environment?: Record<string, any>;
  lifecycle_done?: boolean;
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
export async function finalizeToolLifecycle(input: FinalizeLifecycleInput): Promise<void> {
  const { toolId, status, errorMessage, environment, lifecycle_done } = input;
  const supabase = createSupabaseAdminClient();
  
  console.log(`[Lifecycle] Tool finalized: ${status}`, { toolId, errorMessage, lifecycle_done });

  const updatePayload: any = {
    status,
    error_message: status === "FAILED" ? errorMessage ?? "Unknown error" : null,
    finalized_at: new Date().toISOString(),
  };

  if (lifecycle_done) {
    updatePayload.lifecycle_done = true;
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
}
