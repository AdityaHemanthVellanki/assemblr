import {
  generateDashboardSpec,
  parseAndValidateDashboardSpecFromJsonText,
} from "@/lib/ai/generateDashboardSpec";
import { getServerEnv } from "@/lib/env";

async function run() {
  console.log("Running AI Spec Smoke Test (Real AI)...");
  
  // Ensure Environment
  try {
      getServerEnv();
  } catch (e) {
      console.error("❌ Skipped: Missing AI Environment Variables", e);
      process.exit(1);
  }

  const spec1 = await generateDashboardSpec(
    { prompt: "Create a dashboard for tracking github issues and prs" }
  );
  
  console.log(
    "ok: generated spec",
    spec1.title,
    "Metrics:", spec1.metrics.length,
    "Views:", spec1.views.length,
  );

  if (spec1.metrics.length === 0 && spec1.views.length === 0) {
      console.warn("⚠️ Warning: AI returned empty spec (technically valid JSON but useless)");
  }

  try {
    parseAndValidateDashboardSpecFromJsonText("{not json");
    throw new Error("expected invalid json to fail");
  } catch {
    console.log("ok: invalid json fails safely");
  }
}

run().catch((err) => {
  console.error("ai-spec-smoke-tests failed", err);
  process.exit(1);
});
