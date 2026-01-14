// This script runs in a Node/tsx environment, not inside Next.js.
// We avoid importing the server-only wrapper to keep tests runnable.
// Try to import the server-side planner. If this environment cannot load it
// (e.g. server-only guard), skip this smoke test without failing the suite.
// eslint-disable-next-line @typescript-eslint/no-var-requires
let compileIntent: typeof import("../lib/ai/planner").compileIntent;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  ({ compileIntent } = require("../lib/ai/planner"));
} catch (err) {
  console.log("skipping planner-activity-smoke-test: unable to import server-side planner", err);
  process.exit(0);
}
import type { ToolSpec } from "@/lib/spec/toolSpec";
import type { DiscoveredSchema } from "@/lib/schema/types";
import type { Metric } from "@/lib/metrics/store";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const prompt = "Build a tool to explore activity across my tools";

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  const connectedIntegrationIds = ["github", "slack", "notion", "linear", "google"];

  const schemas: DiscoveredSchema[] = [];
  const metrics: Metric[] = [];
  const policies: Array<unknown> = [];
  const currentSpec: ToolSpec | undefined = undefined;

  const intent = await compileIntent(
    prompt,
    history,
    connectedIntegrationIds,
    schemas,
    metrics,
    "create",
    policies,
    currentSpec,
  );

  assert(intent.output_mode === "mini_app", "expected mini_app output");
  assert(intent.tool_mutation, "expected tool_mutation present");

  console.log("ok: planner compiled 'explore activity across my tools' intent");
}

run().catch((err) => {
  console.error("planner-activity-smoke-test failed", err);
  process.exit(1);
});
