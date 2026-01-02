import {
  generateDashboardSpec,
  type LlmGenerate,
  parseAndValidateDashboardSpecFromJsonText,
} from "@/lib/ai/generateDashboardSpec";

async function run() {
  const fakeLlm: LlmGenerate = async () => {
    // Return a minimal valid spec for schema validation testing only.
    // No mock data or demo scenarios.
    return JSON.stringify({
      title: "Test Spec",
      metrics: [],
      views: [],
    });
  };

  const spec1 = await generateDashboardSpec(
    { prompt: "test prompt" },
    { llm: fakeLlm },
  );
  console.log(
    "ok: prompt test 1",
    spec1.title,
    spec1.metrics.length,
    spec1.views.length,
  );

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
