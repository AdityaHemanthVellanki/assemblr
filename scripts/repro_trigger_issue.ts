
import { validateCompiledIntent, analyzeActionReachability, repairCompiledIntent } from "../lib/ai/planner-logic";
import { CompiledIntent } from "../lib/core/intent";

const intent: CompiledIntent = {
  intent_type: "modify",
  system_goal: "Repro Test",
  constraints: [],
  integrations_required: [],
  output_mode: "mini_app",
  execution_graph: { nodes: [], edges: [] },
  execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
  tool_mutation: {
    actionsAdded: [
      {
        id: "load_activity_detail",
        type: "integration_call",
        triggeredBy: { type: "state_change", stateKey: "selectedActivityId" },
        config: { assign: "activityDetail" }
      }
    ],
    componentsAdded: [],
    pagesAdded: []
  }
};

console.log("--- Running Repro Test ---");
try {
  repairCompiledIntent(intent);
  const triggered = analyzeActionReachability(intent.tool_mutation);
  console.log("Triggered actions:", Array.from(triggered));

  validateCompiledIntent(intent, undefined, { mode: "modify" });
  console.log("Validation PASSED");
} catch (e: any) {
  console.error("Validation FAILED:", e.message);
  process.exit(1);
}
