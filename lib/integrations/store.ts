// import "server-only";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";
import { PlannerContext } from "@/lib/ai/types";
import { listConnections } from "@/lib/integrations/composio/connection";

export async function getConnectedIntegrations(orgId: string): Promise<PlannerContext["integrations"]> {
  // Fetch from Composio
  const connections = await listConnections(orgId);

  const result: PlannerContext["integrations"] = {};

  for (const conn of connections) {
    if (conn.status !== "ACTIVE" && conn.status !== "CONNECTED") continue;

    const integrationId = conn.integrationId; // Composio might return 'appName' or 'integrationId'. Our types map it.

    // Some integrations might not be in our static registry yet, skip them or handle gracefully
    const uiConfig = INTEGRATIONS_UI.find(i => i.id === integrationId);

    // We can get capabilities even if not in registry if we had dynamic discovery, 
    // but for now we rely on static registry + synthesized capabilities
    const caps = getCapabilitiesForIntegration(integrationId);

    result[integrationId] = {
      connected: true,
      capabilities: caps.map(c => c.id),
      scopes: uiConfig?.auth?.scopes ? [...uiConfig.auth.scopes] : undefined,
      health: {
        tokenValid: true, // Composio handles this
        lastCheckedAt: new Date().toISOString()
      }
    };
  }

  return result;
}
