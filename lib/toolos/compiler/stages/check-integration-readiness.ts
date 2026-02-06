import { IntegrationNotConnectedError } from "@/lib/errors/integration-errors";
import { listConnections } from "@/lib/integrations/composio/connection";
import { ComposioConnection } from "@/lib/integrations/composio/types";

// Define minimal interface to avoid circular dependency with tool-compiler.ts
interface MinimalStageContext {
  spec: {
    integrations: Array<{ id: string }>;
    actions: Array<{ integrationId?: string; name: string }>;
  };
  orgId: string;
}

interface Dependencies {
  listConnections?: typeof listConnections;
}

function normalizeScopes(scopes: string[] | string | null | undefined) {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.filter(Boolean);
  return scopes
    .split(/[ ,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runCheckIntegrationReadiness(
  ctx: MinimalStageContext,
  deps: Dependencies = {}
): Promise<{ status: "completed" }> {
  const { spec, orgId } = ctx;
  const fetchConnections = deps.listConnections ?? listConnections;

  const requiredIntegrations = Array.from(new Set([
    ...(spec.integrations || []).map((i) => i.id),
    ...(spec.actions || []).map((a) => a.integrationId).filter(Boolean) as string[],
  ]));

  if (requiredIntegrations.length === 0) {
    return { status: "completed" };
  }

  const connections = await fetchConnections(orgId);

  console.log(`[CheckIntegrationReadiness] Required integrations: ${requiredIntegrations.join(', ')}`);
  console.log(`[CheckIntegrationReadiness] Found ${connections.length} active connections for org ${orgId}:`, connections.map((c: ComposioConnection) => c.integrationId).join(', '));

  const connectedIds = new Set(connections.filter((c: ComposioConnection) => c.status === "CONNECTED" || c.status === "ACTIVE").map((c: ComposioConnection) => c.integrationId));
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

  // Permissions and credential validation is handled by Composio status check above.
  return { status: "completed" };
}
