import { validateCompiledIntent, repairCompiledIntent } from "@/lib/ai/planner-logic";
import { CompiledIntent } from "@/lib/core/intent";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn: () => any, message: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(`Expected throw: ${message}`);
  }
}

async function run() {
  let failures = 0;

  console.log("\n--- Effect-Only: open_in_tool without assign/status ---");
  const intentOpenInTool: CompiledIntent = {
    intent_type: "modify",
    system_goal: "open tool",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        { id: "open_in_tool", type: "integration_call", config: {} },
      ],
      pagesAdded: [{ id: "main" }],
      componentsAdded: [
        { id: "open_btn", type: "button", events: [{ type: "onClick", actionId: "open_in_tool" }] },
      ],
    },
  };
  repairCompiledIntent(intentOpenInTool);
  try {
    validateCompiledIntent(intentOpenInTool);
    const action = intentOpenInTool.tool_mutation!.actionsAdded![0] as any;
    assert(action.effectOnly === true, "auto-classified effectOnly");
    console.log("✅ PASS: open_in_tool compiles without data/status consumption");
  } catch (e: any) {
    console.error(`❌ FAIL: open_in_tool should compile: ${e.message}`);
    failures++;
  }

  console.log("\n--- Effect-Only: navigate_to_url ---");
  const intentNavigate: CompiledIntent = {
    intent_type: "modify",
    system_goal: "navigate",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        { id: "navigate_to_url", type: "integration_call", config: { url: "https://example.com" } },
      ],
      pagesAdded: [{ id: "main" }],
      componentsAdded: [
        { id: "nav_btn", type: "button", events: [{ type: "onClick", actionId: "navigate_to_url" }] },
      ],
    },
  };
  repairCompiledIntent(intentNavigate);
  try {
    validateCompiledIntent(intentNavigate);
    const action = intentNavigate.tool_mutation!.actionsAdded![0] as any;
    assert(action.effectOnly === true, "auto-classified effectOnly for navigate");
    console.log("✅ PASS: navigate_to_url compiles without data/status consumption");
  } catch (e: any) {
    console.error(`❌ FAIL: navigate_to_url should compile: ${e.message}`);
    failures++;
  }

  console.log("\n--- Data Integration remains validated (auto-consumed via normalizer) ---");
  const intentDataStrict: CompiledIntent = {
    intent_type: "modify",
    system_goal: "data test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        { id: "fetch_commits", type: "integration_call", config: { assign: "rawCommits" } },
      ],
      pagesAdded: [{ id: "main" }],
      componentsAdded: [{ id: "title", type: "text", properties: { text: "Commits" } }],
    },
  };
  repairCompiledIntent(intentDataStrict);
  try {
    validateCompiledIntent(intentDataStrict);
    const action = intentDataStrict.tool_mutation!.actionsAdded![0] as any;
    assert(!action.effectOnly, "data action is not effectOnly");
    console.log("✅ PASS: data-producing integration validated via internal consumer");
  } catch (e: any) {
    console.error(`❌ FAIL: data-producing integration should validate: ${e.message}`);
    failures++;
  }

  console.log("\n--- Effect-Only: open external doc ---");
  const intentOpenDoc: CompiledIntent = {
    intent_type: "modify",
    system_goal: "open doc",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        { id: "open_google_doc", type: "integration_call", config: { docId: "abc123" } },
      ],
      pagesAdded: [{ id: "main" }],
      componentsAdded: [{ id: "open_doc_btn", type: "button", events: [{ type: "onClick", actionId: "open_google_doc" }] }],
    },
  };
  repairCompiledIntent(intentOpenDoc);
  try {
    validateCompiledIntent(intentOpenDoc);
    console.log("✅ PASS: open_google_doc compiles as effect-only");
  } catch (e: any) {
    console.error(`❌ FAIL: open_google_doc should compile: ${e.message}`);
    failures++;
  }

  if (failures > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("effect-only-action-tests failed", err);
  process.exit(1);
});
