/**
 * Quick script to run the seeder engine directly.
 * Usage: npx tsx scripts/seed-now.ts [scenario-name]
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { runSeeder } from "../lib/seeder/orchestrator";

const ORG_ID = process.env.SANDBOX_ORG_IDS?.split(",")[0]?.trim();
const scenario = process.argv[2] || "incident-response";

async function main() {
  if (!ORG_ID) {
    console.error("Error: SANDBOX_ORG_IDS not set in .env.local");
    process.exit(1);
  }

  console.log(`\n=== Seeder Engine ===`);
  console.log(`Org:      ${ORG_ID}`);
  console.log(`Scenario: ${scenario}`);
  console.log(`Force:    true`);
  console.log(`========================\n`);

  const result = await runSeeder({
    orgId: ORG_ID,
    scenarioName: scenario,
    force: true,
  });

  console.log(`\n=== Result ===`);
  console.log(`Status:     ${result.status}`);
  console.log(`Resources:  ${result.resourceCount}`);
  console.log(`Duration:   ${result.totalDurationMs}ms`);

  if (result.error) {
    console.log(`Error:      ${result.error}`);
  }

  if (result.steps.length > 0) {
    console.log(`\nSteps:`);
    for (const step of result.steps) {
      const icon = step.status === "success" ? "✓" : "✗";
      console.log(
        `  ${icon} ${step.stepId}: ${step.composioAction} (${step.durationMs}ms)${step.externalResourceId ? ` → ${step.externalResourceId}` : ""}${step.error ? ` — ${step.error}` : ""}`,
      );
    }
  }

  console.log();
  process.exit(result.status === "failed" ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
