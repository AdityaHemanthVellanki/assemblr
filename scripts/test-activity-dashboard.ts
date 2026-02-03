
// This script runs in a Node/tsx environment.
import { getActivityDashboardSpec } from "../lib/ai/templates/activity-dashboard";
import { sanitizeIntegrationsForIntent, buildExecutionGraph, validateCompiledIntent } from "../lib/ai/planner-logic";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import { assertNoMocks, assertRealRuntime } from "@/lib/core/guard";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  assertRealRuntime();
  assertNoMocks();
  throw new Error("Mock downgrade tests are disabled. Use live integrations for validation.");
  console.log("Test 1: Activity Dashboard with NO capabilities (Downgrade Path)...");
  
  // 1. Get Template
  const intent = getActivityDashboardSpec();
  
  // 2. Simulate No Capabilities
  const allowedCapabilityIds = new Set<string>(); // Empty
  
  // 3. Apply Safety Logic
  sanitizeIntegrationsForIntent(intent, allowedCapabilityIds);
  
  // 4. Verify Downgrade
  assert(intent.tool_mutation, "Expected tool_mutation");
  if (!intent.tool_mutation) {
    throw new Error("Expected tool_mutation");
  }
  const mutation = intent.tool_mutation!;
  const actions = mutation.actionsAdded || [];
  const fetchAction = actions.find((a: any) => a.id === "fetch_activities");
  assert(fetchAction, "fetch_activities action missing");
  
  console.log(`fetch_activities type: ${fetchAction.type}`);
  console.log(`fetch_activities config:`, fetchAction.config);
  
  assert(fetchAction.type === "internal", "fetch_activities should be downgraded to internal");
  assert(fetchAction.config?.ephemeral_internal === true, "fetch_activities should be ephemeral_internal");
  
  // 5. Build Graph
  buildExecutionGraph(intent, undefined); // currentSpec is undefined
  
  // 6. Verify Execution Graph
  assert(intent.execution_graph, "Execution graph missing");
  console.log(`Graph Nodes: ${intent.execution_graph.nodes.length}`);
  console.log(`Graph Edges: ${intent.execution_graph.edges.length}`);
  
  assert(intent.execution_graph.nodes.length > 0, "Execution graph should have nodes");
  assert(intent.execution_graph.edges.length > 0, "Execution graph should have edges (ensured by __init__ logic)");
  
  // 7. Validate
  validateCompiledIntent(intent, undefined, { mode: "create" });
  
  // Test 2: UI Structure & Wiring
  console.log("Test 2: UI Structure & Wiring...");
  const pages = mutation.pagesAdded || [];
  assert(pages.length === 1, "Expected 1 page");
  const page = pages[0];
  const filters = page.components.find((c: any) => c.id === "filters_container");
  assert(filters, "Filters container missing");
  
  // Check action wiring
  // select_activity should be internal and reachable
  const selectAction = actions.find((a: any) => a.id === "select_activity");
  assert(selectAction, "select_activity action missing");
  assert(selectAction.type === "internal", "select_activity should be internal");
  
  console.log("ok: Activity Dashboard template tests passed");
}

run().catch((err) => {
  console.error("test-activity-dashboard failed", err);
  process.exit(1);
});
