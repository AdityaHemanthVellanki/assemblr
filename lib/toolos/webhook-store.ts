import { randomUUID, createHmac } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface WebhookEndpoint {
  id: string;
  orgId: string;
  toolId: string;
  triggerId: string;
  secret: string;
  enabled: boolean;
  lastInvokedAt: string | null;
  invocationCount: number;
  createdAt: string;
}

function mapRow(row: any): WebhookEndpoint {
  return {
    id: row.id,
    orgId: row.org_id,
    toolId: row.tool_id,
    triggerId: row.trigger_id,
    secret: row.secret,
    enabled: row.enabled,
    lastInvokedAt: row.last_invoked_at,
    invocationCount: row.invocation_count ?? 0,
    createdAt: row.created_at,
  };
}

export async function createWebhookEndpoint(params: {
  orgId: string;
  toolId: string;
  triggerId: string;
}): Promise<WebhookEndpoint> {
  const supabase = createSupabaseAdminClient();
  const secret = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

  const { data, error } = await (supabase.from("webhook_endpoints") as any)
    .upsert(
      {
        org_id: params.orgId,
        tool_id: params.toolId,
        trigger_id: params.triggerId,
        secret,
        enabled: true,
      },
      { onConflict: "tool_id,trigger_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create webhook endpoint: ${error?.message ?? "unknown"}`);
  }
  return mapRow(data);
}

export async function getWebhookEndpoint(endpointId: string): Promise<WebhookEndpoint | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("webhook_endpoints") as any)
    .select("*")
    .eq("id", endpointId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function getWebhookEndpointByTool(toolId: string, triggerId: string): Promise<WebhookEndpoint | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("webhook_endpoints") as any)
    .select("*")
    .eq("tool_id", toolId)
    .eq("trigger_id", triggerId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function incrementInvocationCount(endpointId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  await (supabase.from("webhook_endpoints") as any)
    .update({
      last_invoked_at: new Date().toISOString(),
      invocation_count: (supabase as any).rpc ? undefined : 0, // Will use RPC below
    })
    .eq("id", endpointId);

  // Increment invocation count
  await (supabase as any).rpc("increment_webhook_count", { endpoint_id: endpointId }).catch(() => {
    // Fallback: read and write if RPC doesn't exist
    (supabase.from("webhook_endpoints") as any)
      .select("invocation_count")
      .eq("id", endpointId)
      .single()
      .then(({ data }: any) => {
        if (data) {
          (supabase.from("webhook_endpoints") as any)
            .update({
              invocation_count: (data.invocation_count ?? 0) + 1,
              last_invoked_at: new Date().toISOString(),
            })
            .eq("id", endpointId);
        }
      });
  });
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time comparison
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
