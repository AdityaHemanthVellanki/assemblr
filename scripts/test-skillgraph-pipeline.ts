/**
 * End-to-end test for the Skill Graph pipeline.
 *
 * Tests every integration action via Composio REST API (direct connectedAccountId),
 * then runs graph → mine → compile.
 *
 * Usage: npx tsx -r ./scripts/setup-env.cjs scripts/test-skillgraph-pipeline.ts
 */

import { getServerEnv } from "@/lib/env/server";
import { extractPayloadArray } from "@/lib/integrations/composio/execution";
import { resolveAssemblrId, getIntegrationConfig } from "@/lib/integrations/composio/config";
import { normalizeEvents } from "@/lib/skillgraph/events/normalizers";
import { buildEventGraph } from "@/lib/skillgraph/graph/build-graph";
import { minePatterns } from "@/lib/skillgraph/mining/mine-patterns";
import { compileAllPatterns } from "@/lib/skillgraph/compiler/compile-skill";
import {
  INGESTION_CONFIGS,
  type IngestionActionConfig,
} from "@/lib/skillgraph/ingestion/ingestion-config";
import type { OrgEvent } from "@/lib/skillgraph/events/event-schema";
import type { IntegrationId } from "@/lib/toolos/spec";

const ORG_ID = process.env.TEST_ORG_ID || "cm6ox6ymo0001nc015g94i3en";

type TestResult = {
  integration: string;
  action: string;
  status: "pass" | "fail" | "skip";
  recordCount: number;
  eventCount: number;
  error?: string;
};

// ─────────────────────────────────────────
// Connection Management (REST API direct)
// ─────────────────────────────────────────

/** Map of composio appName → connectedAccountId */
const connectionMap = new Map<string, string>();

async function loadActiveConnections(): Promise<Set<string>> {
  const env = getServerEnv();
  const apiKey = env.COMPOSIO_API_KEY as string;
  const res = await fetch(
    "https://backend.composio.dev/api/v1/connectedAccounts?limit=200&status=ACTIVE",
    { headers: { "x-api-key": apiKey } },
  );
  const data = await res.json();
  const items: any[] = data.items || [];

  const integrationIds = new Set<string>();
  for (const item of items) {
    const appName = (item.appName || "").toLowerCase();
    if (appName && !connectionMap.has(appName)) {
      connectionMap.set(appName, item.id);
    }
    const assemblrId = resolveAssemblrId(item.appName || "");
    if (assemblrId) integrationIds.add(assemblrId);
  }
  return integrationIds;
}

/** Execute a Composio action via REST API (bypasses entity SDK bug) */
async function execComposioAction(
  appName: string,
  actionName: string,
  input: Record<string, any>,
): Promise<any> {
  const env = getServerEnv();
  const apiKey = env.COMPOSIO_API_KEY as string;
  const connectedAccountId = connectionMap.get(appName.toLowerCase());
  if (!connectedAccountId) {
    throw new Error(`No active Composio connection for app: ${appName}`);
  }

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
    throw new Error(`Composio API ${execRes.status}: ${errText.slice(0, 300)}`);
  }

  let result = await execRes.json();
  // Unwrap SDK envelope
  if (
    result && typeof result === "object" && !Array.isArray(result) &&
    "data" in result && ("successfull" in result || "successful" in result)
  ) {
    const isSuccess = result.successfull === true || result.successful === true;
    if (!isSuccess && result.error) {
      throw new Error(
        `Composio action ${actionName} failed: ${typeof result.error === "string" ? result.error : JSON.stringify(result.error)}`,
      );
    }
    result = result.data;
  }
  if (
    result && typeof result === "object" && !Array.isArray(result) &&
    result.response_data && typeof result.response_data === "object"
  ) {
    result = result.response_data;
  }
  return result;
}

function getAppNameForIntegration(integrationId: string): string {
  const config = getIntegrationConfig(integrationId);
  return config?.appName?.toLowerCase() || integrationId;
}

// ─────────────────────────────────────────
// Phase 1: Test every integration action
// ─────────────────────────────────────────

async function testAllIntegrations(): Promise<{
  results: TestResult[];
  allEvents: OrgEvent[];
}> {
  console.log("\n═══════════════════════════════════════════");
  console.log("  PHASE 1: Integration Ingestion Testing");
  console.log("═══════════════════════════════════════════\n");

  const connectedIds = await loadActiveConnections();
  console.log(`Active connections (${connectionMap.size}): ${Array.from(connectionMap.keys()).join(", ")}`);
  console.log(`Connected Assemblr IDs (${connectedIds.size}): ${Array.from(connectedIds).join(", ")}\n`);

  const results: TestResult[] = [];
  const allEvents: OrgEvent[] = [];

  for (const [integrationId, config] of Object.entries(INGESTION_CONFIGS)) {
    const appName = getAppNameForIntegration(integrationId);

    if (!connectedIds.has(integrationId) && !connectionMap.has(appName)) {
      for (const action of config!.actions) {
        results.push({
          integration: integrationId,
          action: action.composioAction,
          status: "skip",
          recordCount: 0,
          eventCount: 0,
          error: "Not connected",
        });
      }
      continue;
    }

    for (const actionConfig of config!.actions) {
      const result = await testSingleAction(
        appName,
        integrationId as IntegrationId,
        actionConfig,
      );
      results.push(result);

      // Collect events from passing actions
      if (result.status === "pass") {
        try {
          const rawResult = await execComposioAction(
            appName,
            actionConfig.composioAction,
            { ...actionConfig.defaultParams },
          );
          const records = Array.isArray(rawResult)
            ? rawResult
            : extractPayloadArray(rawResult);
          const events = normalizeEvents(
            records,
            ORG_ID,
            integrationId as IntegrationId,
            actionConfig.composioAction,
          );
          allEvents.push(...events);
        } catch {
          // Already tested above
        }
      }
    }
  }

  return { results, allEvents };
}

async function testSingleAction(
  appName: string,
  integrationId: IntegrationId,
  actionConfig: IngestionActionConfig,
): Promise<TestResult> {
  const tag = `${integrationId}/${actionConfig.composioAction}`;
  try {
    process.stdout.write(`  Testing: ${tag} ...`);

    const rawResult = await execComposioAction(
      appName,
      actionConfig.composioAction,
      { ...actionConfig.defaultParams },
    );

    const records = Array.isArray(rawResult)
      ? rawResult
      : extractPayloadArray(rawResult);

    // Test normalization
    const events = normalizeEvents(
      records,
      ORG_ID,
      integrationId,
      actionConfig.composioAction,
    );

    console.log(` ✅ ${records.length} records → ${events.length} events`);

    return {
      integration: integrationId,
      action: actionConfig.composioAction,
      status: "pass",
      recordCount: records.length,
      eventCount: events.length,
    };
  } catch (error: any) {
    console.log(` ❌ ${error.message.slice(0, 120)}`);
    return {
      integration: integrationId,
      action: actionConfig.composioAction,
      status: "fail",
      recordCount: 0,
      eventCount: 0,
      error: error.message,
    };
  }
}

// ─────────────────────────────────────────
// Phase 2-4: Pipeline stages
// ─────────────────────────────────────────

function testEventGraph(events: OrgEvent[]) {
  console.log("\n═══════════════════════════════════════════");
  console.log("  PHASE 2: Event Graph Construction");
  console.log("═══════════════════════════════════════════\n");

  if (events.length === 0) {
    console.log("  ⚠️  No events to build graph from. Skipping.");
    return null;
  }

  const graph = buildEventGraph(events);
  console.log(`  Nodes: ${graph.stats.nodeCount}`);
  console.log(`  Edges: ${graph.stats.edgeCount}`);
  console.log(`  Cross-system edges: ${graph.stats.crossSystemEdges}`);
  console.log(`  Actors: ${Object.keys(graph.actorIndex).length}`);
  console.log(`  Entities: ${Object.keys(graph.entityIndex).length}`);
  console.log(`  Event types: ${Object.keys(graph.eventTypeIndex).length}`);
  console.log(`  ✅ Event graph built successfully`);
  return graph;
}

function testMining(graph: any) {
  console.log("\n═══════════════════════════════════════════");
  console.log("  PHASE 3: Pattern Mining");
  console.log("═══════════════════════════════════════════\n");

  if (!graph || graph.stats.nodeCount === 0) {
    console.log("  ⚠️  No event graph. Skipping mining.");
    return [];
  }

  const patterns = minePatterns(graph);
  console.log(`  Patterns discovered: ${patterns.length}`);
  const crossSystem = patterns.filter((p) => p.crossSystem);
  console.log(`  Cross-system patterns: ${crossSystem.length}`);

  for (const p of patterns.slice(0, 10)) {
    const csLabel = p.crossSystem ? " [CROSS-SYSTEM]" : "";
    console.log(
      `  - ${p.name}${csLabel} (freq: ${p.frequency}, conf: ${(p.confidence * 100).toFixed(0)}%, entropy: ${p.entropy.toFixed(2)})`,
    );
    console.log(
      `    Sequence: ${p.sequence.map((s) => `${s.source}:${s.eventType}`).join(" → ")}`,
    );
  }

  console.log(patterns.length > 0 ? `  ✅ Mining complete` : `  ⚠️  No patterns found (may need more event diversity)`);
  return patterns;
}

function testCompilation(patterns: any[]) {
  console.log("\n═══════════════════════════════════════════");
  console.log("  PHASE 4: Skill Compilation");
  console.log("═══════════════════════════════════════════\n");

  if (patterns.length === 0) {
    console.log("  ⚠️  No patterns to compile. Skipping.");
    return [];
  }

  const skills = compileAllPatterns(patterns);
  console.log(`  Skills compiled: ${skills.length}`);

  for (const s of skills.slice(0, 10)) {
    console.log(
      `  - ${s.name} (${s.nodes.length} nodes, ${s.edges.length} edges, conf: ${(s.metadata.confidence * 100).toFixed(0)}%)`,
    );
    console.log(`    Trigger: ${s.trigger.source}:${s.trigger.eventType}`);
    console.log(`    Description: ${s.description}`);
  }

  if (skills.length > 0) console.log(`  ✅ Compilation complete`);
  return skills;
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

async function main() {
  console.log("\n🧪 Skill Graph Pipeline — Full End-to-End Test\n");
  console.log(`Org ID: ${ORG_ID}`);

  const { results, allEvents } = await testAllIntegrations();

  // Summary
  console.log("\n═══════════════════════════════════════════");
  console.log("  INTEGRATION RESULTS SUMMARY");
  console.log("═══════════════════════════════════════════\n");

  const passed = results.filter((r) => r.status === "pass");
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");

  console.log(`  Total actions: ${results.length}`);
  console.log(`  ✅ Passed: ${passed.length}`);
  console.log(`  ❌ Failed: ${failed.length}`);
  console.log(`  ⏭️  Skipped: ${skipped.length}`);
  console.log(`  Total events normalized: ${allEvents.length}\n`);

  if (failed.length > 0) {
    console.log("  FAILURES:");
    for (const f of failed) {
      console.log(`    ❌ ${f.integration}/${f.action}: ${f.error?.slice(0, 150)}`);
    }
  }

  const sources = new Set(allEvents.map((e) => e.source));
  console.log(`\n  Event sources (${sources.size}): ${Array.from(sources).join(", ")}`);
  const eventTypes = new Set(allEvents.map((e) => e.eventType));
  console.log(`  Event types (${eventTypes.size}): ${Array.from(eventTypes).join(", ")}`);

  const graph = testEventGraph(allEvents);
  const patterns = testMining(graph);
  const skills = testCompilation(patterns);

  console.log("\n═══════════════════════════════════════════");
  console.log("  FINAL PIPELINE SUMMARY");
  console.log("═══════════════════════════════════════════\n");
  console.log(`  Integrations tested: ${passed.length + failed.length} / ${results.length}`);
  console.log(`  Actions passed: ${passed.length}, failed: ${failed.length}`);
  console.log(`  Events ingested: ${allEvents.length}`);
  console.log(`  Graph nodes: ${graph?.stats?.nodeCount ?? 0}, edges: ${graph?.stats?.edgeCount ?? 0}`);
  console.log(`  Patterns mined: ${patterns.length}`);
  console.log(`  Skills compiled: ${skills.length}`);
  console.log(`\n  Pipeline: ${failed.length === 0 ? "✅ ALL PASS" : `⚠️  ${failed.length} failures need fixing`}\n`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
