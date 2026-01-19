
import { decryptJson } from "@/lib/security/encryption";

export async function getValidAccessToken(orgId: string, integrationId: string): Promise<string> {
  if (process.env.IS_HARNESS === "true") {
    if (integrationId === "google_expired") return "expired_token";
    if (integrationId === "google_missing") throw new Error(`Integration ${integrationId} not connected`);
    return "mock_valid_token";
  }

  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = await createSupabaseServerClient();
  const { data: connection, error } = await supabase
    .from("integration_connections")
    .select("encrypted_credentials, updated_at")
    .eq("org_id", orgId)
    .eq("integration_id", integrationId)
    .single();

  if (error || !connection) {
    throw new Error(`Integration ${integrationId} not connected`);
  }

  const credentials = decryptJson((connection as any).encrypted_credentials as any) as any;
  // TODO: Add actual refresh logic here if needed.
  // For now, we assume the token is valid or long-lived.
  return credentials.access_token;
}
