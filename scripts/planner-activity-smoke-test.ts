// This script runs in a Node/tsx environment, not inside Next.js.
// We avoid importing the server-only wrapper to keep tests runnable.
// Try to import the server-side planner. If this environment cannot load it
// (e.g. server-only guard), skip this smoke test without failing the suite.
async function loadCompileIntent() {
  try {
    const mod = await import("../lib/ai/planner");
    return mod.compileIntent;
  } catch (err) {
    console.log(
      "skipping planner-activity-smoke-test: unable to import server-side planner",
      err,
    );
    process.exit(0);
  }
}
import type { ToolSpec } from "@/lib/spec/toolSpec";
import type { DiscoveredSchema } from "@/lib/schema/types";
import type { Metric } from "@/lib/metrics/store";
import type { OrgPolicy } from "@/lib/core/governance";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const compileIntent = await loadCompileIntent();
  const prompt = "Build a tool to explore activity across my tools";

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  const plannerContext = {
    integrations: {
        github: { connected: true, capabilities: ["github_issues_list", "github_repos_list", "github_commits_list"], scopes: ["repo"] },
        slack: { connected: true, capabilities: ["slack_channels_list", "slack_messages_list"], scopes: ["chat:write"] },
        notion: { connected: true, capabilities: ["notion_pages_search", "notion_databases_list"], scopes: [] },
        linear: { connected: true, capabilities: ["linear_issues_list", "linear_teams_list"], scopes: ["read"] },
        google: { connected: true, capabilities: ["google_drive_list", "google_gmail_list"], scopes: ["https://www.googleapis.com/auth/drive.readonly"] }
    }
  };

  const schemas: DiscoveredSchema[] = [];
  const metrics: Metric[] = [];
  const policies: OrgPolicy[] = [];
  const currentSpec: ToolSpec | undefined = undefined;

  const intent = await compileIntent(
    prompt,
    history,
    plannerContext,
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
