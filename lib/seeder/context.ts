/**
 * Seeder execution context.
 *
 * Provides a unified interface for executing Composio actions,
 * logging, and tracking created resources.
 */

import { EntityRegistry } from "./registry";
import { execSeederAction, resolveConnectionId } from "./composio-exec";
import type { SeederIntegration, SeederLog, StepResult } from "./types";
import { SEED_TAG } from "./types";

export interface SeederContext {
  orgId: string;
  executionId: string;
  registry: EntityRegistry;
  log: SeederLog;
  connectionMap: Map<string, string>;
  stepResults: Map<string, StepResult>;

  /** Execute a Composio action for an integration. */
  execAction(
    integration: SeederIntegration,
    composioAction: string,
    input: Record<string, any>,
  ): Promise<any>;

  /** Check if an integration is connected. */
  hasConnection(integration: SeederIntegration): boolean;

  /** Get the connected account ID for an integration. */
  getConnectionId(integration: SeederIntegration): string | undefined;
}

export function createSeederContext(params: {
  orgId: string;
  executionId: string;
  connectionMap: Map<string, string>;
  log: SeederLog;
}): SeederContext {
  const { orgId, executionId, connectionMap, log } = params;
  const registry = new EntityRegistry();
  const stepResults = new Map<string, StepResult>();

  return {
    orgId,
    executionId,
    registry,
    log,
    connectionMap,
    stepResults,

    hasConnection(integration: SeederIntegration): boolean {
      return !!resolveConnectionId(connectionMap, integration);
    },

    getConnectionId(integration: SeederIntegration): string | undefined {
      return resolveConnectionId(connectionMap, integration);
    },

    async execAction(
      integration: SeederIntegration,
      composioAction: string,
      input: Record<string, any>,
    ): Promise<any> {
      const connId = resolveConnectionId(connectionMap, integration);
      if (!connId) {
        throw new Error(`No connection found for integration: ${integration}`);
      }

      log("info", `Executing ${composioAction} for ${integration}`);
      const start = Date.now();

      try {
        const result = await execSeederAction(connId, composioAction, input);
        const duration = Date.now() - start;
        log("info", `${composioAction} completed in ${duration}ms`);
        return result;
      } catch (error: any) {
        const duration = Date.now() - start;
        log("error", `${composioAction} failed after ${duration}ms: ${error.message}`);
        throw error;
      }
    },
  };
}

/**
 * Inject the [ASSEMBLR_SEED] tag into text fields.
 * Ensures all seeder-created resources are tagged for identification + cleanup.
 */
export function tagPayload(payload: Record<string, any>, textFields: string[]): Record<string, any> {
  const tagged = { ...payload };
  for (const field of textFields) {
    if (typeof tagged[field] === "string" && !tagged[field].includes(SEED_TAG)) {
      tagged[field] = `${SEED_TAG} ${tagged[field]}`;
    }
  }
  return tagged;
}
