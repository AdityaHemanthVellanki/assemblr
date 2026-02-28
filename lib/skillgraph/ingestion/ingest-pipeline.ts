import type { IntegrationId } from "@/lib/toolos/spec";
import type { OrgEvent, SkillGraphWorkspace } from "../events/event-schema";
import { normalizeEvents } from "../events/normalizers";
import {
  getIngestionConfig,
  getConfiguredIntegrationIds,
  type IngestionActionConfig,
} from "./ingestion-config";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";
import { getIntegrationConfig } from "@/lib/integrations/composio/config";
import { listConnections } from "@/lib/integrations/composio/connection";
import { getServerEnv } from "@/lib/env";

/** Maximum events to store in a single workspace (prevents JSONB bloat) */
const MAX_EVENTS_PER_WORKSPACE = 10_000;

export type IngestionProgress = {
  stage: "ingestion";
  integration: string;
  action: string;
  status: "running" | "done" | "error";
  eventCount: number;
  message: string;
};

export type OnIngestionProgress = (progress: IngestionProgress) => void;

/**
 * Load active Composio connections for a specific org.
 * Returns a map of composio appName → connectedAccountId.
 *
 * Uses the org-scoped `listConnections()` which queries by entity ID,
 * ensuring we only get connections belonging to this org.
 */
async function loadOrgComposioConnections(orgId: string): Promise<Map<string, string>> {
  const connectionMap = new Map<string, string>();

  try {
    const connections = await listConnections(orgId);

    for (const conn of connections) {
      if (conn.status !== "ACTIVE" && conn.status !== "CONNECTED") continue;
      const appName = (conn.appName || "").toLowerCase();
      if (appName && !connectionMap.has(appName)) {
        connectionMap.set(appName, conn.id);
      }
    }

    console.log(
      `[IngestionPipeline] Loaded ${connectionMap.size} org-scoped connections for org ${orgId}: ${[...connectionMap.keys()].join(", ")}`,
    );
  } catch (error: any) {
    console.error("[IngestionPipeline] Failed to load org connections:", error.message);
  }

  return connectionMap;
}

/**
 * Execute a Composio action via REST API using connectedAccountId directly.
 * This is the proven approach that bypasses the entity SDK bug.
 */
async function execComposioAction(
  apiKey: string,
  connectedAccountId: string,
  actionName: string,
  input: Record<string, any>,
): Promise<any> {
  const execRes = await fetch(
    `https://backend.composio.dev/api/v2/actions/${encodeURIComponent(actionName)}/execute`,
    {
      method: "POST",
      headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId, input }),
    },
  );

  if (!execRes.ok) {
    const errText = await execRes.text();
    throw new Error(`Composio action ${actionName} error ${execRes.status}: ${errText.slice(0, 300)}`);
  }

  let result = await execRes.json();

  // Unwrap SDK envelope
  if (
    result && typeof result === "object" && !Array.isArray(result) &&
    "data" in result && ("successfull" in result || "successful" in result)
  ) {
    const isSuccess = result.successfull === true || result.successful === true;
    if (!isSuccess && result.error) {
      const errMsg = typeof result.error === "string"
        ? result.error
        : JSON.stringify(result.error);
      throw new Error(`Composio action ${actionName} failed: ${errMsg}`);
    }
    result = result.data;
  }

  // Unwrap response_data
  if (
    result && typeof result === "object" && !Array.isArray(result) &&
    result.response_data && typeof result.response_data === "object"
  ) {
    result = result.response_data;
  }

  return result;
}

/**
 * Ingest data from all connected integrations for an organization.
 *
 * Flow:
 *  1. Load org-scoped Composio connections via SDK entity API
 *  2. Filter configured integrations to only those that are connected
 *  3. For each, execute all READ actions via REST API with connectedAccountId
 *  4. Normalize raw results to OrgEvents via integration normalizers
 *  5. Deduplicate events by ID
 *  6. Return updated workspace with events and ingestion state
 */
export async function runIngestionPipeline(params: {
  orgId: string;
  connectedIntegrationIds: string[];
  existingWorkspace: SkillGraphWorkspace;
  onProgress?: OnIngestionProgress;
}): Promise<SkillGraphWorkspace> {
  const { orgId, connectedIntegrationIds, existingWorkspace, onProgress } = params;
  const connectedSet = new Set(connectedIntegrationIds);

  // Load org-scoped Composio connections
  const connectionMap = await loadOrgComposioConnections(orgId);
  const env = getServerEnv();
  const apiKey = env.COMPOSIO_API_KEY as string;

  // Determine which integrations to ingest
  const configuredIds = getConfiguredIntegrationIds();
  const toIngest = configuredIds.filter((id) => connectedSet.has(id));

  console.log(
    `[IngestionPipeline] Starting ingestion for org ${orgId}. ` +
    `Connected: ${connectedIntegrationIds.length}, Configured: ${configuredIds.length}, ` +
    `Will ingest: ${toIngest.length} (${toIngest.join(", ")})`,
  );

  // Build a dedup set from existing events
  const existingEventIds = new Set(existingWorkspace.events.map((e) => e.id));
  const newEvents: OrgEvent[] = [];
  const ingestionState = { ...existingWorkspace.ingestionState };

  // Process each integration sequentially (respects rate limits)
  for (const integrationId of toIngest) {
    const config = getIngestionConfig(integrationId);
    if (!config) continue;

    // Resolve Composio app name for this integration
    const integConfig = getIntegrationConfig(integrationId);
    const appName = (integConfig?.appName || integrationId).toLowerCase();
    const connectedAccountId = connectionMap.get(appName);

    if (!connectedAccountId) {
      console.warn(`[IngestionPipeline] No Composio connection for ${integrationId} (app: ${appName}). Skipping.`);
      ingestionState.errors[integrationId] = `No active connection for ${appName}`;
      ingestionState.status[integrationId] = "error";
      continue;
    }

    ingestionState.status[integrationId] = "syncing";
    onProgress?.({
      stage: "ingestion",
      integration: integrationId,
      action: "",
      status: "running",
      eventCount: 0,
      message: `Starting ${integrationId} ingestion...`,
    });

    let integrationEventCount = 0;
    // Clear previous errors for this integration
    delete ingestionState.errors[integrationId];

    for (const actionConfig of config.actions) {
      try {
        const events = await executeAndNormalize({
          apiKey,
          connectedAccountId,
          orgId,
          integrationId,
          actionConfig,
        });

        // Deduplicate
        for (const event of events) {
          if (!existingEventIds.has(event.id)) {
            existingEventIds.add(event.id);
            newEvents.push(event);
            integrationEventCount++;
          }
        }

        onProgress?.({
          stage: "ingestion",
          integration: integrationId,
          action: actionConfig.composioAction,
          status: "done",
          eventCount: integrationEventCount,
          message: `${integrationId}: ${actionConfig.entityType} — ${events.length} events`,
        });
      } catch (error: any) {
        console.error(
          `[IngestionPipeline] Failed ${integrationId}/${actionConfig.composioAction}:`,
          error?.message,
        );

        ingestionState.errors[integrationId] = error?.message || "Unknown error";

        onProgress?.({
          stage: "ingestion",
          integration: integrationId,
          action: actionConfig.composioAction,
          status: "error",
          eventCount: integrationEventCount,
          message: `${integrationId}: ${actionConfig.composioAction} failed — ${error?.message}`,
        });
      }

      // Rate limiting between actions
      if (config.rateLimitMs > 0) {
        await sleep(config.rateLimitMs);
      }
    }

    // Update integration state
    ingestionState.status[integrationId] = ingestionState.errors[integrationId]
      ? "error"
      : "done";
    ingestionState.lastSync[integrationId] = new Date().toISOString();
  }

  // Merge existing + new events, respecting the cap
  const allEvents = [...existingWorkspace.events, ...newEvents];
  const capped = allEvents.length > MAX_EVENTS_PER_WORKSPACE
    ? allEvents.slice(allEvents.length - MAX_EVENTS_PER_WORKSPACE)
    : allEvents;

  ingestionState.totalEvents = capped.length;

  console.log(
    `[IngestionPipeline] Complete. New events: ${newEvents.length}, ` +
    `Total events: ${capped.length}, Integrations processed: ${toIngest.length}`,
  );

  return {
    ...existingWorkspace,
    events: capped,
    ingestionState,
  };
}

/**
 * Ingest a single integration (for targeted re-sync).
 */
export async function ingestSingleIntegration(params: {
  orgId: string;
  integrationId: IntegrationId;
  existingWorkspace: SkillGraphWorkspace;
  onProgress?: OnIngestionProgress;
}): Promise<SkillGraphWorkspace> {
  return runIngestionPipeline({
    orgId: params.orgId,
    connectedIntegrationIds: [params.integrationId],
    existingWorkspace: params.existingWorkspace,
    onProgress: params.onProgress,
  });
}

/**
 * Execute a single Composio action via REST API and normalize the results.
 */
async function executeAndNormalize(params: {
  apiKey: string;
  connectedAccountId: string;
  orgId: string;
  integrationId: IntegrationId;
  actionConfig: IngestionActionConfig;
}): Promise<OrgEvent[]> {
  const { apiKey, connectedAccountId, orgId, integrationId, actionConfig } = params;

  console.log(
    `[IngestionPipeline] Executing ${actionConfig.composioAction} for ${integrationId}`,
  );

  const rawResult = await execComposioAction(
    apiKey,
    connectedAccountId,
    actionConfig.composioAction,
    { ...actionConfig.defaultParams },
  );

  // Extract array from Composio's wrapped response
  const records = Array.isArray(rawResult)
    ? rawResult
    : extractPayloadArray(rawResult);

  console.log(
    `[IngestionPipeline] ${actionConfig.composioAction}: ${records.length} raw records`,
  );

  // Normalize to canonical events
  return normalizeEvents(
    records,
    orgId,
    integrationId,
    actionConfig.composioAction,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
