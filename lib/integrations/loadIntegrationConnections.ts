import { listConnections } from "@/lib/integrations/composio/connection";
import { INTEGRATION_AUTH_CONFIG } from "@/lib/integrations/composio/config";

/**
 * Reverse mapping: Composio appName → Assemblr integration ID.
 * Built from INTEGRATION_AUTH_CONFIG where keys are Assemblr IDs and values contain appName.
 * e.g. "googlesheets" → "google", "github" → "github"
 */
const COMPOSIO_TO_ASSEMBLR: Record<string, string> = {};
for (const [assemblrId, config] of Object.entries(INTEGRATION_AUTH_CONFIG)) {
  COMPOSIO_TO_ASSEMBLR[config.appName.toLowerCase()] = assemblrId;
}

function resolveAssemblrId(composioAppName: string): string {
  return COMPOSIO_TO_ASSEMBLR[composioAppName] ?? composioAppName;
}

export async function loadIntegrationConnections(params: {
  supabase: any;
  orgId: string;
}): Promise<{ integration_id: string }[]> {
  const connections = await listConnections(params.orgId);

  // Deduplicate by Assemblr integration ID — only include active/connected ones
  const seen = new Set<string>();
  const result: { integration_id: string }[] = [];

  for (const conn of connections) {
    if (conn.status !== "ACTIVE" && conn.status !== "CONNECTED") continue;
    const id = resolveAssemblrId(conn.integrationId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({ integration_id: id });
  }

  return result;
}
