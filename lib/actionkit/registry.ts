import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchIntegrationSchemas } from "@/lib/integrations/composio/discovery";
import { Synthesizer } from "@/lib/capabilities/synthesis/synthesizer";
import { getIntegrationConfig } from "@/lib/integrations/composio/config";
import { getComposioEntityId } from "@/lib/integrations/composio/connection";
import type { RegisteredAction, ActionType } from "./types";

// ---------------------------------------------------------------------------
// In-memory cache (per-process, backed by DB)
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, { actions: RegisteredAction[]; fetchedAt: number }>();
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all registered actions for an integration.
 * Resolution order: memory cache → database → Composio dynamic discovery.
 */
export async function getActionsForIntegration(
  integrationId: string,
  options?: { forceRefresh?: boolean; entityId?: string },
): Promise<RegisteredAction[]> {
  const cacheKey = integrationId.toLowerCase();

  // 1. Memory cache (fastest)
  if (!options?.forceRefresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < MEMORY_CACHE_TTL_MS) {
      return cached.actions;
    }
  }

  // 2. Database
  const dbActions = await loadFromDatabase(cacheKey);
  if (dbActions.length > 0 && !options?.forceRefresh) {
    // Check staleness
    const oldestDiscovery = Math.min(...dbActions.map((a) => new Date(a.discoveredAt).getTime()));
    const oldestTtl = Math.min(...dbActions.map((a) => a.ttlHours));
    const isStale = Date.now() - oldestDiscovery > oldestTtl * 60 * 60 * 1000;

    if (!isStale) {
      memoryCache.set(cacheKey, { actions: dbActions, fetchedAt: Date.now() });
      return dbActions;
    }
  }

  // 3. Composio dynamic discovery + persist
  const entityId = options?.entityId;
  if (!entityId) {
    // If we have stale DB data but no entityId for refresh, return stale
    if (dbActions.length > 0) {
      memoryCache.set(cacheKey, { actions: dbActions, fetchedAt: Date.now() });
      return dbActions;
    }
    return [];
  }

  const discovered = await discoverAndPersistActions(integrationId, entityId);
  memoryCache.set(cacheKey, { actions: discovered, fetchedAt: Date.now() });
  return discovered;
}

/**
 * Get a single action by capability ID.
 */
export async function getAction(capabilityId: string): Promise<RegisteredAction | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await (supabase.from("broker_capabilities") as any)
    .select("*")
    .eq("capability_id", capabilityId)
    .maybeSingle();

  if (!data) return null;
  return mapRowToAction(data);
}

/**
 * Discover all actions from Composio for an integration and persist to DB.
 */
export async function discoverAndPersistActions(
  integrationId: string,
  entityId: string,
): Promise<RegisteredAction[]> {
  const config = getIntegrationConfig(integrationId);
  const appName = config.appName;

  let composioActions;
  try {
    composioActions = await fetchIntegrationSchemas(entityId, appName);
  } catch (err) {
    console.error(`[ActionKit] Failed to discover actions for ${integrationId}:`, err);
    return [];
  }

  if (!composioActions || composioActions.length === 0) {
    return [];
  }

  const synthesizer = new Synthesizer();
  const capabilities = synthesizer.synthesize(composioActions, integrationId);

  const actions: RegisteredAction[] = capabilities.map((cap) => {
    const actionType = classifyActionType(cap.type, cap.name);
    return {
      id: cap.id,
      integrationId,
      displayName: cap.name,
      description: cap.description,
      actionType,
      composioActionName: cap.originalActionId,
      inputSchema: cap.parameters ?? {},
      outputSchema: {},
      resource: cap.resource ?? "unknown",
      requiredScopes: [],
      discoveredAt: new Date().toISOString(),
      ttlHours: 24,
    };
  });

  // Persist to database
  await upsertToDatabase(actions);

  return actions;
}

/**
 * Resolve a capability ID to a Composio action name.
 * Checks DB first, then returns the ID as-is (for direct Composio action names).
 */
export async function resolveComposioActionName(capabilityId: string): Promise<string | null> {
  // Handle "integration:ACTION_NAME" format
  const actionPart = capabilityId.includes(":") ? capabilityId.split(":")[1] : capabilityId;

  // Check database
  const supabase = createSupabaseAdminClient();
  const { data } = await (supabase.from("broker_capabilities") as any)
    .select("composio_action_name")
    .eq("capability_id", capabilityId)
    .maybeSingle();

  if (data?.composio_action_name) {
    return data.composio_action_name;
  }

  // If the actionPart looks like a Composio action name (ALL_CAPS_WITH_UNDERSCORES), return it
  if (/^[A-Z][A-Z0-9_]+$/.test(actionPart)) {
    return actionPart;
  }

  return null;
}

/**
 * Get actions for multiple integrations at once.
 */
export async function getActionsForIntegrations(
  integrationIds: string[],
  entityId?: string,
): Promise<Map<string, RegisteredAction[]>> {
  const result = new Map<string, RegisteredAction[]>();
  const promises = integrationIds.map(async (id) => {
    const actions = await getActionsForIntegration(id, { entityId });
    result.set(id, actions);
  });
  await Promise.allSettled(promises);
  return result;
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

async function loadFromDatabase(integrationId: string): Promise<RegisteredAction[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase.from("broker_capabilities") as any)
    .select("*")
    .eq("integration_id", integrationId)
    .order("display_name", { ascending: true });

  if (error || !data) return [];
  return data.map(mapRowToAction);
}

async function upsertToDatabase(actions: RegisteredAction[]): Promise<void> {
  if (actions.length === 0) return;

  const supabase = createSupabaseAdminClient();
  const rows = actions.map((action) => ({
    integration_id: action.integrationId,
    capability_id: action.id,
    display_name: action.displayName,
    description: action.description ?? "",
    action_type: action.actionType,
    required_scopes: action.requiredScopes,
    input_schema: action.inputSchema,
    output_schema: action.outputSchema,
    composio_action_name: action.composioActionName,
    resource: action.resource,
    discovered_at: new Date().toISOString(),
    ttl_hours: action.ttlHours,
  }));

  const { error } = await (supabase.from("broker_capabilities") as any).upsert(rows, {
    onConflict: "integration_id,capability_id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("[ActionKit] Failed to upsert actions:", error);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRowToAction(row: any): RegisteredAction {
  return {
    id: row.capability_id,
    integrationId: row.integration_id,
    displayName: row.display_name,
    description: row.description ?? "",
    actionType: row.action_type as ActionType,
    composioActionName: row.composio_action_name ?? "",
    inputSchema: row.input_schema ?? {},
    outputSchema: row.output_schema ?? {},
    resource: row.resource ?? "unknown",
    requiredScopes: row.required_scopes ?? [],
    discoveredAt: row.discovered_at ?? new Date().toISOString(),
    ttlHours: row.ttl_hours ?? 24,
  };
}

function classifyActionType(
  capType: string | undefined,
  name: string,
): ActionType {
  if (capType === "create") return "WRITE";
  if (capType === "update") return "MUTATE";
  if (capType === "delete") return "MUTATE";
  if (capType === "list" || capType === "get" || capType === "search") return "READ";

  // Heuristic from name
  const lower = (name ?? "").toLowerCase();
  if (lower.includes("send") || lower.includes("post") || lower.includes("notify")) return "NOTIFY";
  if (lower.includes("create") || lower.includes("add")) return "WRITE";
  if (lower.includes("update") || lower.includes("edit") || lower.includes("modify")) return "MUTATE";
  if (lower.includes("delete") || lower.includes("remove")) return "MUTATE";

  return "READ";
}
