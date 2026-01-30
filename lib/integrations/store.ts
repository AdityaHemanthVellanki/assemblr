// import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";
import { PlannerContext } from "@/lib/ai/types";
import { checkIntegrationHealth } from "@/lib/integrations/health";

export async function getConnectedIntegrations(orgId: string): Promise<PlannerContext["integrations"]> {
  const supabase = await createSupabaseServerClient();
  
  // Fetch from the authoritative table
  const { data: connections, error } = await supabase
    .from("integration_connections")
    .select("integration_id, status")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (error) {
    console.error("Failed to fetch connected integrations:", error);
    return {};
  }

  const result: PlannerContext["integrations"] = {};
  
  for (const conn of connections || []) {
    const integrationId = conn.integration_id;
    const caps = getCapabilitiesForIntegration(integrationId);
    const uiConfig = INTEGRATIONS_UI.find(i => i.id === integrationId);
    
    // Check Health
    const health = await checkIntegrationHealth(orgId, integrationId);

    result[integrationId] = {
      connected: true,
      capabilities: caps.map(c => c.id),
      scopes: uiConfig?.auth?.scopes ? [...uiConfig.auth.scopes] : undefined,
      health: {
        tokenValid: health.tokenValid,
        error: health.error,
        lastCheckedAt: health.lastCheckedAt
      }
    };
  }

  return result;
}
