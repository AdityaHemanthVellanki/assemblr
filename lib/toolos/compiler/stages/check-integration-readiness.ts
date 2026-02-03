import { createSupabaseAdminClient as defaultCreateSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadIntegrationConnections as defaultLoadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { IntegrationNotConnectedError } from "@/lib/errors/integration-errors";
import { getIntegrationUIConfig } from "@/lib/integrations/registry";
import { getIntegrationTokenStatus, getValidAccessToken } from "@/lib/integrations/tokenRefresh";

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
  loadOrgIntegrations?: (input: {
    supabase: unknown;
    orgId: string;
    integrationIds: string[];
  }) => Promise<Array<{ integration_id: string; status?: string | null; scopes?: string[] | null }>>;
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

  const loadOrgIntegrations =
    deps.loadOrgIntegrations ??
    (async (input: { supabase: unknown; orgId: string; integrationIds: string[] }) => {
      const { data, error } = await (input.supabase as any)
        .from("org_integrations")
        .select("integration_id, status, scopes")
        .eq("org_id", input.orgId)
        .in("integration_id", input.integrationIds);
      if (error) {
        throw new Error(error.message);
      }
      return (data ?? []) as Array<{ integration_id: string; status?: string | null; scopes?: string[] | null }>;
    });

  const orgIntegrations = await loadOrgIntegrations({
    supabase: adminClient,
    orgId,
    integrationIds: requiredIntegrations,
  });

  const orgIntegrationsById = new Map(
    orgIntegrations.map((row) => [row.integration_id, row]),
  );

  const missingPermissions: string[] = [];
  const invalidCredentials: string[] = [];
  for (const integrationId of requiredIntegrations) {
    const row = orgIntegrationsById.get(integrationId);
    if (!row) continue;
    const ui = getIntegrationUIConfig(integrationId);
    const requiredScopes = ui.auth.type === "oauth" ? ui.auth.scopes ?? [] : [];
    const grantedScopes = normalizeScopes(row.scopes ?? []);
    const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
    if (row.status === "missing_permissions" || row.status === "revoked" || missingScopes.length > 0) {
      missingPermissions.push(integrationId);
      const blockingActions = spec.actions
        .filter((a) => a.integrationId === integrationId)
        .map((a) => a.name);
      allBlockingActions.push(...blockingActions);
    }

    try {
      const tokenStatus = await getIntegrationTokenStatus(orgId, integrationId);
      if (tokenStatus.status !== "valid") {
        invalidCredentials.push(integrationId);
        continue;
      }
      await getValidAccessToken(orgId, integrationId);
    } catch {
      invalidCredentials.push(integrationId);
    }
  }

  if (missingPermissions.length > 0) {
    throw new IntegrationNotConnectedError({
      integrationIds: missingPermissions,
      blockingActions: allBlockingActions,
      requiredBy: allBlockingActions,
    });
  }

  if (invalidCredentials.length > 0) {
    throw new IntegrationNotConnectedError({
      integrationIds: Array.from(new Set(invalidCredentials)),
      blockingActions: allBlockingActions,
      requiredBy: allBlockingActions,
    });
  }

  return { status: "completed" };
}
