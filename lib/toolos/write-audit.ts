import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface WriteAuditEntry {
  orgId: string;
  userId: string;
  toolId: string;
  actionId: string;
  actionType: "WRITE" | "MUTATE" | "NOTIFY";
  integrationId: string;
  input: Record<string, any>;
  output: any;
  status: "success" | "failed" | "dry_run" | "pending_approval";
  durationMs: number;
  error?: string | null;
}

/**
 * Log a write/mutate/notify action to broker_action_logs for audit trail.
 * Fire-and-forget — failures are logged but don't block execution.
 */
export async function logWriteAction(entry: WriteAuditEntry): Promise<void> {
  try {
    const supabase = createSupabaseAdminClient();

    // Find the connection for this org+integration to get connectionId
    const { data: conn } = await (supabase.from("broker_connections") as any)
      .select("id")
      .eq("org_id", entry.orgId)
      .eq("integration_id", entry.integrationId)
      .limit(1)
      .maybeSingle();

    const connectionId = conn?.id ?? null;

    if (!connectionId) {
      // Can't log without a connection — just console.warn
      console.warn(`[WriteAudit] No connection found for org=${entry.orgId} integration=${entry.integrationId}`);
      return;
    }

    await (supabase.from("broker_action_logs") as any).insert({
      org_id: entry.orgId,
      user_id: entry.userId,
      connection_id: connectionId,
      action_id: entry.actionId,
      input_params: sanitizeAuditInput(entry.input),
      output_summary: summarizeAuditOutput(entry.output),
      status: entry.status,
      duration_ms: entry.durationMs,
    });
  } catch (err) {
    console.error("[WriteAudit] Failed to log action:", err);
  }
}

function sanitizeAuditInput(input: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (lower.includes("token") || lower.includes("secret") || lower.includes("password") || lower.includes("api_key")) {
      out[key] = "[redacted]";
    } else if (typeof value === "string" && value.length > 1000) {
      out[key] = value.slice(0, 1000) + "...[truncated]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

function summarizeAuditOutput(output: any): any {
  if (output == null) return null;
  if (typeof output === "string") return output.length > 500 ? output.slice(0, 500) : output;
  if (Array.isArray(output)) return { type: "array", count: output.length };
  if (typeof output === "object") return { type: "object", keys: Object.keys(output).slice(0, 20) };
  return output;
}
