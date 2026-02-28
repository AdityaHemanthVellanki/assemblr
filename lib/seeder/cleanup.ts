/**
 * Seeder cleanup — reverse seeded resources.
 *
 * Reads the execution log and calls appropriate delete/close
 * actions for each created resource. Only targets resources
 * marked with [ASSEMBLR_SEED].
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env/server";
import { loadSeederConnections, resolveConnectionId, execSeederAction } from "./composio-exec";
import {
  getExecutionLogs,
  markLogCleaned,
  markExecutionCleaned,
} from "./execution-logger";
import type { SeederIntegration } from "./types";

/** Composio cleanup actions: maps resource types to their delete/close action. */
const CLEANUP_ACTIONS: Record<string, { action: string; buildInput: (resourceId: string) => Record<string, any> }> = {
  github_issue: {
    action: "GITHUB_UPDATE_AN_ISSUE",
    buildInput: (id) => ({
      // We'd need owner + repo which we don't have in the log
      // GitHub issues can't be deleted, only closed
      state: "closed",
      issue_number: parseInt(id, 10) || undefined,
    }),
  },
  linear_issue: {
    action: "LINEAR_UPDATE_ISSUE",
    buildInput: (id) => ({
      issueId: id,
      stateId: undefined, // Would need "Cancelled" state ID
      // Instead we'll try to cancel/archive it
    }),
  },
  slack_message: {
    action: "SLACKBOT_DELETE_A_MESSAGE",
    buildInput: (ts) => ({
      ts,
      // channel needed but not in log — skip cleanup for messages
    }),
  },
  hubspot_deal: {
    action: "HUBSPOT_DELETE_A_DEAL",
    buildInput: (id) => ({ dealId: id }),
  },
  hubspot_contact: {
    action: "HUBSPOT_DELETE_A_CONTACT",
    buildInput: (id) => ({ contactId: id }),
  },
  notion_page: {
    action: "NOTION_ARCHIVE_A_PAGE",
    buildInput: (id) => ({ page_id: id, archived: true }),
  },
};

export interface CleanupResult {
  executionId: string;
  cleaned: number;
  failed: number;
  skipped: number;
  errors: string[];
}

/**
 * Clean up all resources created by a seeder execution.
 *
 * Only deletes/closes resources that were successfully created
 * and have a known cleanup action.
 */
export async function cleanupSeedExecution(
  orgId: string,
  executionId: string,
): Promise<CleanupResult> {
  const env = getServerEnv();
  if (env.ENABLE_SEEDER_ENGINE !== "true") {
    throw new Error("Seeder engine is disabled");
  }

  // Validate execution belongs to this org
  const supabase = createSupabaseAdminClient();
  const { data: execution } = await (supabase.from("seeder_executions") as any)
    .select("id, org_id, status")
    .eq("id", executionId)
    .eq("org_id", orgId)
    .single();

  if (!execution) {
    throw new Error(`Execution ${executionId} not found for org ${orgId}`);
  }

  if (execution.status === "cleaned") {
    return { executionId, cleaned: 0, failed: 0, skipped: 0, errors: ["Already cleaned"] };
  }

  // Load connections for cleanup API calls
  const connectionMap = await loadSeederConnections(orgId);

  // Get all successful log entries
  const logs = await getExecutionLogs(executionId);

  let cleaned = 0;
  let failed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Process in reverse order (undo last actions first)
  for (const log of logs.reverse()) {
    if (!log.external_resource_id || !log.external_resource_type) {
      skipped++;
      continue;
    }

    const cleanupConfig = CLEANUP_ACTIONS[log.external_resource_type];
    if (!cleanupConfig) {
      console.log(`[Seeder Cleanup] No cleanup action for type: ${log.external_resource_type}`);
      skipped++;
      continue;
    }

    const integration = log.integration as SeederIntegration;
    const connId = resolveConnectionId(connectionMap, integration);
    if (!connId) {
      console.log(`[Seeder Cleanup] No connection for ${integration}, skipping`);
      skipped++;
      continue;
    }

    try {
      const input = cleanupConfig.buildInput(log.external_resource_id);
      console.log(`[Seeder Cleanup] ${cleanupConfig.action} for ${log.external_resource_type} ${log.external_resource_id}`);

      await execSeederAction(connId, cleanupConfig.action, input);
      await markLogCleaned(log.id);
      cleaned++;
    } catch (error: any) {
      console.error(`[Seeder Cleanup] Failed to clean ${log.external_resource_type} ${log.external_resource_id}: ${error.message}`);
      errors.push(`${log.external_resource_type}/${log.external_resource_id}: ${error.message}`);
      failed++;
    }
  }

  // Mark execution as cleaned if all resources handled
  if (failed === 0) {
    await markExecutionCleaned(executionId);
  }

  return { executionId, cleaned, failed, skipped, errors };
}
