/**
 * CLI script to run the Integration Seeder Engine.
 *
 * Usage:
 *   npx tsx scripts/run-seeder.ts --scenario incident-response
 *   npx tsx scripts/run-seeder.ts --scenario deal-escalation --force
 *   npx tsx scripts/run-seeder.ts --profile startup
 *   npx tsx scripts/run-seeder.ts --list
 *
 * Requires:
 *   - ENABLE_SEEDER_ENGINE=true in .env.local
 *   - Org must be marked as sandbox (is_sandbox=true)
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { bootstrapRealUserSession } from "./auth-bootstrap";
import { runSeeder } from "@/lib/seeder/orchestrator";
import { listScenarios } from "@/lib/seeder/scenarios";
import { cleanupSeedExecution } from "@/lib/seeder/cleanup";
import { loadSeederConnections } from "@/lib/seeder/composio-exec";
import { createSeederContext } from "@/lib/seeder/context";
import { PROFILES } from "@/lib/seeder/profiles";
import { GitHubSeeder } from "@/lib/seeder/integrations/github";
import { LinearSeeder } from "@/lib/seeder/integrations/linear";
import { SlackSeeder } from "@/lib/seeder/integrations/slack";
import { NotionSeeder } from "@/lib/seeder/integrations/notion";
import type { SeederLog } from "@/lib/seeder/types";

async function run() {
  const args = process.argv.slice(2);

  // Parse CLI args
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || "true";
      i++;
    }
  }

  // List scenarios
  if (flags.list) {
    console.log("\nAvailable scenarios:");
    for (const s of listScenarios()) {
      console.log(`  ${s.name} — ${s.description} (requires: ${s.requiredIntegrations.join(", ")})`);
    }
    console.log("\nAvailable profiles:");
    for (const [id, p] of Object.entries(PROFILES)) {
      console.log(`  ${id} — ${p.name}: ${p.description}`);
    }
    return;
  }

  // Bootstrap auth
  console.log("Bootstrapping auth...");
  const { user, orgId } = await bootstrapRealUserSession();
  console.log(`Authenticated as ${user.email} (Org: ${orgId})`);

  // Scenario-based seeding
  if (flags.scenario) {
    console.log(`\nRunning scenario: ${flags.scenario}`);
    const result = await runSeeder({
      orgId,
      scenarioName: flags.scenario,
      force: flags.force === "true",
    });

    console.log("\n--- Seeder Result ---");
    console.log(`Status: ${result.status}`);
    console.log(`Execution ID: ${result.executionId}`);
    console.log(`Resources created: ${result.resourceCount}`);
    console.log(`Duration: ${result.totalDurationMs}ms`);
    if (result.error) console.log(`Error: ${result.error}`);
    console.log("\nSteps:");
    for (const step of result.steps) {
      const icon = step.status === "success" ? "+" : "x";
      console.log(`  [${icon}] ${step.stepId}: ${step.action} (${step.durationMs}ms)${step.externalResourceId ? ` -> ${step.externalResourceId}` : ""}${step.error ? ` ERROR: ${step.error}` : ""}`);
    }
    return;
  }

  // Cleanup
  if (flags.cleanup) {
    console.log(`\nCleaning up execution: ${flags.cleanup}`);
    const result = await cleanupSeedExecution(orgId, flags.cleanup);
    console.log(`Cleaned: ${result.cleaned}, Failed: ${result.failed}, Skipped: ${result.skipped}`);
    if (result.errors.length > 0) {
      console.log("Errors:", result.errors);
    }
    return;
  }

  // Profile-based bulk seeding
  const profileName = flags.profile || "startup";
  const profile = PROFILES[profileName];
  if (!profile) {
    console.error(`Unknown profile: ${profileName}. Available: ${Object.keys(PROFILES).join(", ")}`);
    process.exit(1);
  }

  console.log(`\nBulk seeding with profile: ${profile.name}`);

  const connectionMap = await loadSeederConnections(orgId);
  console.log(`Loaded ${connectionMap.size} connections: ${[...connectionMap.keys()].join(", ")}`);

  const log: SeederLog = (level, msg) => console.log(`[${level.toUpperCase()}] ${msg}`);
  const ctx = createSeederContext({
    orgId,
    executionId: `bulk_${Date.now()}`,
    connectionMap,
    log,
  });

  // Run bulk seeders sequentially
  await new GitHubSeeder().run(ctx, profile);
  await new LinearSeeder().run(ctx, profile);
  await new SlackSeeder().run(ctx, profile);
  await new NotionSeeder().run(ctx, profile);

  // Save manifest
  const manifestPath = await ctx.registry.saveManifest(orgId, Date.now().toString());
  console.log(`\nManifest saved to ${manifestPath}`);
}

run().catch((e) => {
  console.error("Seeder failed:", e.message);
  process.exit(1);
});
