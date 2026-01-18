
// This script runs in a Node/tsx environment.
import { getActivityDashboardSpec } from "../lib/ai/templates/activity-dashboard";
import { sanitizeIntegrationsForIntent, buildExecutionGraph, validateCompiledIntent } from "../lib/ai/planner-logic";
import type { ToolSpec } from "@/lib/spec/toolSpec";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log("Test 1: Activity Dashboard with NO capabilities (Downgrade Path)...");
  
  // 1. Get Template
  const intent = getActivityDashboardSpec();
  
  // 2. Simulate No Capabilities
  const allowedCapabilityIds = new Set<string>(); // Empty
  
  // 3. Apply Safety Logic
  sanitizeIntegrationsForIntent(intent, allowedCapabilityIds);
  
  // 4. Verify Downgrade
  assert(intent.tool_mutation, "Expected tool_mutation");
  const actions = intent.tool_mutation.actionsAdded || [];
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
  
  console.log("ok: Activity Dashboard template tests passed");
}

run().catch((err) => {
  console.error("test-activity-dashboard failed", err);
  process.exit(1);
});
