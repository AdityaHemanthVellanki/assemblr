/**
 * Composio action executor for the Seeder Engine.
 *
 * Uses the REST API directly with connectedAccountId (proven approach
 * from ingest-pipeline.ts that bypasses entity SDK bugs).
 */

import { getServerEnv } from "@/lib/env/server";
import { listConnections } from "@/lib/integrations/composio/connection";
import { getIntegrationConfig } from "@/lib/integrations/composio/config";
import type { SeederIntegration } from "./types";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000];

/**
 * Load org-scoped Composio connections.
 * Returns a map of integration ID → connectedAccountId.
 */
export async function loadSeederConnections(orgId: string): Promise<Map<string, string>> {
  const connectionMap = new Map<string, string>();
  const connections = await listConnections(orgId);

  for (const conn of connections) {
    if (conn.status !== "ACTIVE" && conn.status !== "CONNECTED") continue;
    const appName = (conn.appName || "").toLowerCase();
    if (!appName || connectionMap.has(appName)) continue;
    connectionMap.set(appName, conn.id);
  }

  return connectionMap;
}

/**
 * Resolve an Assemblr integration ID to its Composio connectedAccountId.
 */
export function resolveConnectionId(
  connectionMap: Map<string, string>,
  integration: SeederIntegration,
): string | undefined {
  // Try direct app name first
  const config = getIntegrationConfig(integration);
  const appName = (config?.appName || integration).toLowerCase();
  return connectionMap.get(appName) || connectionMap.get(integration);
}

/**
 * Execute a Composio action via REST API with retry + backoff.
 */
export async function execSeederAction(
  connectedAccountId: string,
  actionName: string,
  input: Record<string, any>,
): Promise<any> {
  const env = getServerEnv();
  const apiKey = env.COMPOSIO_API_KEY as string;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 4000;
      console.log(`[Seeder] Retry ${attempt}/${MAX_RETRIES} for ${actionName} after ${delay}ms`);
      await sleep(delay);
    }

    try {
      const res = await fetch(
        `https://backend.composio.dev/api/v2/actions/${encodeURIComponent(actionName)}/execute`,
        {
          method: "POST",
          headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ connectedAccountId, input }),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        // Don't retry on 4xx client errors (except 429 rate limit)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`Composio ${actionName} error ${res.status}: ${errText.slice(0, 300)}`);
        }
        lastError = new Error(`Composio ${actionName} error ${res.status}: ${errText.slice(0, 300)}`);
        continue;
      }

      let result = await res.json();

      // Unwrap SDK envelope
      if (
        result && typeof result === "object" && !Array.isArray(result) &&
        "data" in result && ("successfull" in result || "successful" in result)
      ) {
        const isSuccess = result.successfull === true || result.successful === true;
        if (!isSuccess && result.error) {
          const errMsg = typeof result.error === "string" ? result.error : JSON.stringify(result.error);
          throw new Error(`Composio ${actionName} failed: ${errMsg}`);
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
    } catch (error: any) {
      lastError = error;
      // Don't retry non-retriable errors
      if (error.message?.includes("error 4") && !error.message?.includes("error 429")) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Failed to execute ${actionName} after ${MAX_RETRIES} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
