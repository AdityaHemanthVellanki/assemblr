
import { validateCompiledIntent, analyzeActionReachability, repairCompiledIntent } from "../lib/ai/planner-logic";
import { CompiledIntent } from "../lib/core/intent";
import { assertNoMocks, assertRealRuntime } from "../lib/core/guard";

assertRealRuntime();
assertNoMocks();
throw new Error("Mock trigger regression tests are disabled. Use live integration flows for validation.");

// Mock helper to create a valid base CompiledIntent
function createMockIntent(mutation: any): CompiledIntent {
    return {
        intent_type: "modify",
        system_goal: "Regression Test",
        constraints: [],
        integrations_required: [],
        output_mode: "mini_app",
        execution_graph: { nodes: [], edges: [] },
        execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
        tool_mutation: mutation
    };
}

function runTest(name: string, intent: CompiledIntent, expectedTriggers?: string[]) {
  console.log(`\n--- Running Test: ${name} ---`);
  try {
    repairCompiledIntent(intent);
    const triggered = analyzeActionReachability(intent.tool_mutation);
    console.log("Triggered actions:", Array.from(triggered));
    
    if (expectedTriggers) {
        const missing = expectedTriggers.filter(t => !triggered.has(t));
        if (missing.length) {
            console.error(`FAILED: Missing expected triggers: ${missing.join(", ")}`);
            process.exit(1);
        }
    }

    validateCompiledIntent(intent, undefined, { mode: "modify" });
    console.log("Validation PASSED");
  } catch (e: any) {
    console.error("Validation FAILED:", e.message);
    process.exit(1);
  }
}

// 1. LIST -> SELECT -> DETAIL FLOW
// Validates that state_change trigger is accepted for detail loading
runTest("List -> Select -> Detail Flow", createMockIntent({
  stateAdded: {
    selectedActivityId: null,
    activityDetail: null
  },
  actionsAdded: [
    {
      id: "select_activity",
      type: "state_mutation",
      config: { updates: { selectedActivityId: "{{item.id}}" } },
      triggeredBy: { type: "user_event", componentId: "list1", event: "onItemClick" }
    },
    {
      id: "load_activity_detail",
      type: "integration_call",
      config: { integrationId: "crm", capabilityId: "get_activity", assign: "activityDetailRaw" },
      inputs: ["selectedActivityId"], // Implicit dependency
      triggeredBy: { type: "state_change", stateKey: "selectedActivityId" }
    }
  ],
  componentsAdded: [
    { id: "list1", type: "list", events: [{ type: "onItemClick", actionId: "select_activity" }] }
  ]
}), ["select_activity", "load_activity_detail"]);

// 2. STATE-DRIVEN TRIGGERS (Explicit)
// Validates that explicit state_change triggers are respected
runTest("State-driven triggers", createMockIntent({
  stateAdded: { filter: "open" },
  actionsAdded: [
    {
      id: "update_filter",
      type: "state_mutation",
      config: { updates: { filter: "{{value}}" } },
      triggeredBy: { type: "user_event", componentId: "filter_select", event: "onChange" }
    },
    {
      id: "fetch_data",
      type: "integration_call",
      config: { integrationId: "db", capabilityId: "query", assign: "queryResult" },
      triggeredBy: { type: "state_change", stateKey: "filter" }
    }
  ],
  componentsAdded: [
    { id: "filter_select", type: "select", events: [{ type: "onChange", actionId: "update_filter" }] }
  ]
}), ["fetch_data"]);

// 3. EFFECT-ONLY INTEGRATION
// Validates that effect-only actions (no state update) are allowed if triggered
runTest("Effect-only integration", createMockIntent({
  actionsAdded: [
    {
      id: "send_email",
      type: "integration_call",
      config: { integrationId: "email", capabilityId: "send" }, // No assign
      effectOnly: true, // Explicitly mark as effect-only
      triggeredBy: { type: "user_event", componentId: "btn_send", event: "onClick" }
    }
  ],
  componentsAdded: [
    { id: "btn_send", type: "button", events: [{ type: "onClick", actionId: "send_email" }] }
  ]
}));

// 4. MULTI-STEP CAUSAL CHAIN
// Validates A -> state -> B -> state -> C chain
runTest("Multi-step causal chain", createMockIntent({
  stateAdded: { stateA: "init", stateB: "init" },
  actionsAdded: [
    {
      id: "step1",
      type: "state_mutation",
      config: { updates: { stateA: "changed" } },
      triggeredBy: { type: "user_event", componentId: "btn1", event: "onClick" }
    },
    {
      id: "step2",
      type: "state_mutation",
      config: { updates: { stateB: "changed" } },
      triggeredBy: { type: "state_change", stateKey: "stateA" }
    },
    {
      id: "step3",
      type: "integration_call",
      config: { integrationId: "api", capabilityId: "do_thing", assign: "finalResult" },
      triggeredBy: { type: "state_change", stateKey: "stateB" }
    }
  ],
  componentsAdded: [
    { id: "btn1", type: "button", events: [{ type: "onClick", actionId: "step1" }] }
  ]
}), ["step3"]);

// 5. FILTERS -> REFETCH -> NORMALIZE -> RENDER
// Validates complex canonical pipeline
runTest("Filters -> Refetch -> Normalize", createMockIntent({
  stateAdded: { "filters.status": "all", rawData: [], normalizedData: [] },
  actionsAdded: [
    {
      id: "set_filter",
      type: "state_mutation",
      config: { updates: { "filters.status": "{{value}}" } },
      triggeredBy: { type: "user_event", componentId: "status_select", event: "onChange" }
    },
    {
      id: "fetch_items",
      type: "integration_call",
      config: { integrationId: "api", capabilityId: "list", assign: "rawData" },
      triggeredBy: { type: "state_change", stateKey: "filters.status" }
    },
    {
      id: "normalize_items",
      type: "internal", // Transform
      config: { assign: "normalizedData" },
      triggeredBy: { type: "state_change", stateKey: "rawData" }
    }
  ],
  componentsAdded: [
    { id: "status_select", type: "select", events: [{ type: "onChange", actionId: "set_filter" }] },
    { id: "item_list", type: "list", dataSource: { type: "state", value: "normalizedData" } }
  ]
}), ["fetch_items", "normalize_items"]); // normalize_items is triggered by rawData change

// 6. DETAIL LOADING WITH EMPTY INITIAL STATE
// Validates that null/empty initial state doesn't block validation
runTest("Detail loading empty state", createMockIntent({
  stateAdded: { selectedId: null },
  actionsAdded: [
    {
      id: "load_user",
      type: "integration_call",
      config: { integrationId: "api", capabilityId: "get_user", assign: "user" },
      triggeredBy: { type: "state_change", stateKey: "selectedId" }
    }
  ],
  componentsAdded: [] // No UI trigger needed if we assume selectedId can change (e.g. externally or by another view)
}), ["load_user"]);

console.log("\nAll regression tests passed!");
