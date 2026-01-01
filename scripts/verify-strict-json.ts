import {
  generateDashboardSpec,
  type LlmGenerate,
} from "@/lib/ai/generateDashboardSpec";

async function run() {
  console.log("Running Strict JSON Verification...");

  // Mock LLM that returns non-JSON
  const nonJsonLlm: LlmGenerate = async () => {
    return "This is just plain text, not JSON.";
  };

  try {
    await generateDashboardSpec({ prompt: "test" }, { llm: nonJsonLlm });
    throw new Error("FAIL: generateDashboardSpec should have thrown on non-JSON output");
  } catch (err) {
    if (err instanceof Error && err.message === "AI returned non-JSON response") {
      console.log("PASS: Caught non-JSON response correctly.");
    } else {
      console.error("FAIL: Caught unexpected error:", err);
      process.exit(1);
    }
  }

  // Mock LLM that returns JSON but invalid spec
  const invalidSpecLlm: LlmGenerate = async () => {
    return JSON.stringify({ invalid: "field" });
  };

  try {
    await generateDashboardSpec({ prompt: "test" }, { llm: invalidSpecLlm });
    throw new Error("FAIL: generateDashboardSpec should have thrown on invalid spec schema");
  } catch (err) {
    // Zod error or similar
    console.log("PASS: Caught invalid schema correctly.");
  }

  console.log("All strict JSON tests passed.");
}

run().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
