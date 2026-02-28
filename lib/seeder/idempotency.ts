/**
 * Seeder idempotency tracker.
 *
 * Computes a deterministic hash from scenario + timestamp bucket
 * to prevent duplicate executions within the same time window.
 */

import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Time bucket size for idempotency (1 hour). */
const BUCKET_SIZE_MS = 60 * 60 * 1000;

/**
 * Compute a deterministic hash for a scenario execution.
 * Same scenario + org + time bucket = same hash.
 */
export function computeExecutionHash(
  orgId: string,
  scenarioName: string,
): string {
  const timeBucket = Math.floor(Date.now() / BUCKET_SIZE_MS);
  const input = `${orgId}:${scenarioName}:${timeBucket}`;
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * Check if an execution with this hash already exists.
 * Returns the existing execution ID if found, undefined otherwise.
 */
export async function checkIdempotency(
  orgId: string,
  executionHash: string,
): Promise<string | undefined> {
  const supabase = createSupabaseAdminClient();

  const { data } = await (supabase.from("seeder_executions") as any)
    .select("id, status")
    .eq("org_id", orgId)
    .eq("execution_hash", executionHash)
    .in("status", ["running", "completed"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    return data[0].id;
  }

  return undefined;
}
