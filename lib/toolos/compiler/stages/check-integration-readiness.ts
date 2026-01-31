import { createSupabaseAdminClient as defaultCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadIntegrationConnections as defaultLoadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { IntegrationNotConnectedError } from "@/lib/errors/integration-errors";

// Define minimal interface to avoid circular dependency with tool-compiler.ts
interface MinimalStageContext {
  spec: {
    integrations: Array<{ id: string }>;
    actions: Array<{ integrationId?: string; name: string }>;
  };
  orgId: string;
}

interface Dependencies {
  createSupabaseAdminClient?: typeof defaultCreateSupabaseAdminClient;
  loadIntegrationConnections?: typeof defaultLoadIntegrationConnections;
}

export async function runCheckIntegrationReadiness(
  ctx: MinimalStageContext,
  deps: Dependencies = {}
): Promise<{ status: "completed" }> {
  const { spec, orgId } = ctx;
  const createSupabaseAdminClient = deps.createSupabaseAdminClient ?? defaultCreateSupabaseAdminClient;
  const loadIntegrationConnections = deps.loadIntegrationConnections ?? defaultLoadIntegrationConnections;

  const requiredIntegrations = Array.from(new Set([
    ...(spec.integrations || []).map((i) => i.id),
    ...(spec.actions || []).map((a) => a.integrationId).filter(Boolean) as string[],
  ]));
  
  if (requiredIntegrations.length === 0) {
    return { status: "completed" };
  }

  // We use admin client to bypass RLS for this system check
  const adminClient = createSupabaseAdminClient();
  
  // Load active connections
  const connections = await loadIntegrationConnections({
    supabase: adminClient,
    orgId: orgId,
  });
  
  const connectedIds = new Set(connections.map((c) => c.integration_id));
  const missingIntegrations: string[] = [];
  const allBlockingActions: string[] = [];

  for (const integrationId of requiredIntegrations) {
    if (!connectedIds.has(integrationId)) {
      missingIntegrations.push(integrationId);
      
      // Find actions that require this integration
      const blockingActions = spec.actions
        .filter((a) => a.integrationId === integrationId)
        .map((a) => a.name);
      
      allBlockingActions.push(...blockingActions);
    }
  }

  if (missingIntegrations.length > 0) {
    // This error will be caught by the API handler and returned to frontend
    throw new IntegrationNotConnectedError({
      integrationIds: missingIntegrations,
      blockingActions: allBlockingActions,
      requiredBy: allBlockingActions,
    });
  }

  return { status: "completed" };
}
