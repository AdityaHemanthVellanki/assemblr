import "server-only";

import { Capability } from "./capabilities";
import { NormalizedData } from "./types";
import { getConnector } from "./registry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/security/encryption";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";

type ExecuteIntegrationFetchInput = {
  orgId: string;
  integrationId: string;
  capability: Capability;
  parameters: Record<string, unknown>;
};

export async function executeIntegrationFetch({
  orgId,
  integrationId,
  capability,
  parameters,
}: ExecuteIntegrationFetchInput): Promise<NormalizedData> {
  const timestamp = new Date().toISOString();
  console.log(`[Integration Execution] Start: ${integrationId} capability=${capability} org=${orgId} time=${timestamp}`);

  try {
    // 1. Load connector from registry
    const connector = getConnector(integrationId);

    // 2. Validate capability supported
    if (!connector.capabilities.includes(capability)) {
      throw new Error(`Capability ${capability} not supported by integration ${integrationId}`);
    }

    // 3. Load & decrypt credentials
    let credentials: Record<string, unknown> = {};
    
    if (connector.authType === "oauth") {
      // Use Token Refresh Logic
      const accessToken = await getValidAccessToken(orgId, integrationId);
      credentials = { access_token: accessToken };
    } else if (connector.authType !== "none") {
      // Manual Credential Loading (API Keys, Database, etc.)
      // Use Admin Client to ensure we can load credentials in background jobs
      const supabase = createSupabaseAdminClient();
      const { data: connection, error } = await supabase
        .from("integration_connections")
        .select("encrypted_credentials")
        .eq("org_id", orgId)
        .eq("integration_id", integrationId)
        .single();

      if (error || !connection) {
        throw new Error(`No connection found for integration ${integrationId} in org ${orgId}`);
      }

      try {
        const raw = connection.encrypted_credentials as unknown;
        if (typeof raw !== "string" || !raw.trim()) {
          throw new Error("Missing credentials");
        }
        const enc =
          typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
        credentials = decryptJson(enc as never);
      } catch {
        throw new Error("Failed to decrypt integration credentials");
      }
    }

    // 4. Execute fetch
    // Inject credentials into input for connector to use
    const fetchInput = {
      capability,
      parameters,
      credentials, 
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await connector.fetch(fetchInput as any);

    let count = 0;
    if (result.type === "table") count = result.rows.length;
    else if (result.type === "events") count = result.events.length;
    else if (result.type === "messages") count = result.messages.length;
    else if (result.type === "metrics") count = result.metrics.length;
    else if (result.type === "documents") count = result.documents.length;
    
    console.log(`[Integration Execution] Success: ${integrationId} capability=${capability} count=${count}`);
    return result;

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Integration Execution] Error: ${integrationId} capability=${capability} error=${message}`);
    throw err; // Re-throw for caller handling
  }
}
