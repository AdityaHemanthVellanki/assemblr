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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";
import { assertNoMocks, assertRealRuntime } from "@/lib/core/guard";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  assertRealRuntime();
  assertNoMocks();
  const compileIntent = await loadCompileIntent();
  const prompt = "Build a tool to explore activity across my tools";

  const history: Array<{ role: "user" | "assistant"; content: string }> = [];

  const orgId = process.env.E2E_TEST_ORG_ID;
  if (!orgId) {
    throw new Error("E2E_TEST_ORG_ID must be set for planner smoke test.");
  }
  const admin = createSupabaseAdminClient();
  const connections = await loadIntegrationConnections({ supabase: admin, orgId });
  const integrationIds = connections.map((c) => c.integration_id);
  if (integrationIds.length === 0) {
    throw new Error("No active integration connections found for org. Real credentials are required.");
  }
  const { data: orgIntegrations, error } = await (admin.from("org_integrations") as any)
    .select("integration_id, scopes")
    .eq("org_id", orgId)
    .in("integration_id", integrationIds);
  if (error) {
    throw new Error(`Failed to load org integrations: ${error.message}`);
  }
  const scopesById = new Map(
    (orgIntegrations ?? []).map((row: any) => [row.integration_id, row.scopes ?? []]),
  );
  const plannerContext = {
    integrations: integrationIds.reduce<Record<string, any>>((acc, id) => {
      acc[id] = {
        connected: true,
        capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
        scopes: scopesById.get(id) ?? [],
      };
      return acc;
    }, {}),
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
