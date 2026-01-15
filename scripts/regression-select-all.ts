import { repairCompiledIntent, validateCompiledIntent } from "../lib/ai/planner-logic";
import { CompiledIntent } from "../lib/core/intent";

function createMockIntent(mutation: any): CompiledIntent {
  return {
    intent_type: "modify",
    system_goal: "Select All Regression",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: mutation,
  };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`PASSED: ${msg}`);
  }
}

function testStaticOptionsNormalization() {
  console.log("\n--- Test: Static options normalization ---");
  const intent = createMockIntent({
    componentsAdded: [
      {
        id: "tool_filter",
        type: "select",
        properties: {
          options: [
            { label: "All", value: "" },
            { label: "Open", value: "open" },
          ],
          bindKey: "filters.status",
        },
      },
    ],
    stateAdded: {
      "filters.status": "",
    },
  });

  repairCompiledIntent(intent);
  validateCompiledIntent(intent, undefined, { mode: "modify" });

  const mutation: any = intent.tool_mutation;
  const comp = mutation.componentsAdded[0];
  const optionValues = (comp.properties.options || []).map((o: any) => o.value);

  assert(optionValues.includes("__all__"), "Empty option value normalized to '__all__'");
  assert(!optionValues.includes(""), "No empty option values remain after normalization");

  const stateAdded = mutation.stateAdded || {};
  assert(stateAdded["filters.status"] === "__all__", "Filter state default normalized to '__all__'");
}

function testAutoWiredFilterDefaults() {
  console.log("\n--- Test: Auto-wired filter defaults ---");
  const intent = createMockIntent({
    componentsAdded: [
      {
        id: "select_status",
        type: "select",
        properties: {
          options: [{ label: "All", value: "" }, { label: "Closed", value: "closed" }],
        },
      },
    ],
  });

  repairCompiledIntent(intent);
  validateCompiledIntent(intent, undefined, { mode: "modify" });

  const mutation: any = intent.tool_mutation;
  const comp = mutation.componentsAdded[0];
  const bindKey = comp.properties.bindKey;
  assert(typeof bindKey === "string" && bindKey.startsWith("filters."), "Select auto-bound to filters.* state key");

  const stateAdded = mutation.stateAdded || {};
  assert(stateAdded[bindKey] === "__all__", "Auto-wired filter state default is '__all__'");

  const optionValues = (comp.properties.options || []).map((o: any) => o.value);
  assert(optionValues[0] === "__all__", "Auto-wired select empty option normalized to '__all__'");
}

function main() {
  testStaticOptionsNormalization();
  testAutoWiredFilterDefaults();
  console.log("\nAll select '__all__' regression tests passed.");
}

main();
