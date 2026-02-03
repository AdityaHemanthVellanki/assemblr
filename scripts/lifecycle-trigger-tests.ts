import { validateCompiledIntent, repairCompiledIntent } from "@/lib/ai/planner-logic";
import { CompiledIntent } from "@/lib/core/intent";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { assertNoMocks, ensureRuntimeOrThrow } from "@/lib/core/guard";

// Mock types
type MockIntent = CompiledIntent;
type MockSpec = ToolSpec;

function createMockIntent(mutation: any): MockIntent {
  return {
    intent_type: "create",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: mutation
  };
}

function expectThrows(fn: () => void, message?: string) {
  let threw = false;
  try {
    fn();
  } catch (e: any) {
    threw = true;
    if (message && !e.message.includes(message)) {
      throw new Error(`Expected error to include "${message}", but got "${e.message}"`);
    }
  }
  if (!threw) {
    throw new Error("Expected function to throw");
  }
}

function expectNotThrows(fn: () => void) {
  try {
    fn();
  } catch (e) {
    throw new Error(`Expected function not to throw, but got error: ${e}`);
  }
}

async function runTests() {
  ensureRuntimeOrThrow();
  assertNoMocks();
  throw new Error("Mock lifecycle trigger tests are disabled. Use live integration flows for validation.");
  console.log("Running Lifecycle Trigger Guardrail Tests...");

  // Test 1: Action with no trigger -> auto-attached (onPageLoad)
  console.log("Test 1: Action with no trigger -> auto-attached (onPageLoad)");
  {
    const intent = createMockIntent({
      actionsAdded: [
        { id: "fetch_data", type: "integration_call", config: { assign: "data" } }
      ],
      pagesAdded: [
        { id: "page1", components: [] }
      ],
      componentsAdded: [
        { id: "text1", type: "text", properties: { content: "{{state.data}}", loadingKey: "dataStatus" }, dataSource: { type: "state", value: "data" } }
      ]
    });

    // Before auto-attach, it should fail validation (or orphan check would catch it)
    // Note: repairCompiledIntent handles this now.
    
    // Auto-attach
    repairCompiledIntent(intent);

    // Verify auto-attachment
    const mutation = intent.tool_mutation as any;
    const pageUpdates = mutation.pagesUpdated || [];
    const hasPageLoad = pageUpdates.some((u: any) => 
      u.pageId === "page1" && 
      u.patch.events.some((e: any) => e.type === "onPageLoad" && e.actionId === "fetch_data" && e.args?.autoAttached)
    );

    if (!hasPageLoad) {
      throw new Error("Failed to auto-attach onPageLoad trigger to orphan action");
    }

    // After auto-attach, it should pass validation
    expectNotThrows(() => validateCompiledIntent(intent));
  }

  // Test 2: Page with fetch action -> fires on load (Explicit Lifecycle Trigger)
  console.log("Test 2: Page with fetch action -> fires on load (Explicit Lifecycle Trigger)");
  {
    const intent = createMockIntent({
      actionsAdded: [
        { 
          id: "fetch_init", 
          type: "integration_call", 
          config: { assign: "initData" },
          triggeredBy: { type: "lifecycle", event: "onPageLoad" }
        }
      ],
      pagesAdded: [
        { id: "page1", components: [] }
      ],
      componentsAdded: [
         { id: "text2", type: "text", properties: { content: "{{state.initData}}", loadingKey: "initDataStatus" }, dataSource: { type: "state", value: "initData" } }
      ]
    });

    // Should pass validation immediately due to explicit lifecycle trigger
    expectNotThrows(() => validateCompiledIntent(intent));

    // Auto-attach should convert it to page event
    repairCompiledIntent(intent);

    const mutation = intent.tool_mutation as any;
    const pageUpdates = mutation.pagesUpdated || [];
    const hasPageLoad = pageUpdates.some((u: any) => 
      u.pageId === "page1" && 
      u.patch.events.some((e: any) => e.type === "onPageLoad" && e.actionId === "fetch_init")
    );

    if (!hasPageLoad) {
      throw new Error("Failed to convert explicit lifecycle trigger to page event");
    }
  }

  // Test 3: Multi-page app -> only first page auto-fires
  console.log("Test 3: Multi-page app -> only first page auto-fires");
  {
    const intent = createMockIntent({
      actionsAdded: [
        { id: "orphan_action", type: "integration_call", config: { assign: "orphanData" } }
      ],
      pagesAdded: [
        { id: "home", components: [] },
        { id: "details", components: [] }
      ],
      componentsAdded: [
         { id: "text3", type: "text", properties: { content: "{{state.orphanData}}", loadingKey: "orphanDataStatus" }, dataSource: { type: "state", value: "orphanData" } }
      ]
    });

    repairCompiledIntent(intent);

    const mutation = intent.tool_mutation as any;
    const pageUpdates = mutation.pagesUpdated || [];
    
    const homeUpdate = pageUpdates.find((u: any) => u.pageId === "home");
    const detailsUpdate = pageUpdates.find((u: any) => u.pageId === "details");

    const homeHasTrigger = homeUpdate?.patch.events?.some((e: any) => e.actionId === "orphan_action");
    const detailsHasTrigger = detailsUpdate?.patch.events?.some((e: any) => e.actionId === "orphan_action");

    if (!homeHasTrigger) {
      throw new Error("Orphan action should be attached to the first page (home)");
    }
    if (detailsHasTrigger) {
      throw new Error("Orphan action should NOT be attached to subsequent pages (details)");
    }
  }

  // Test 4: Explicit triggers override defaults
  console.log("Test 4: Explicit triggers override defaults (No duplicate auto-attach)");
  {
    const intent = createMockIntent({
      actionsAdded: [
        { 
          id: "explicit_action", 
          type: "integration_call", 
          config: { assign: "explicitData" },
          triggeredBy: { type: "lifecycle", event: "onPageLoad" } // Explicit
        }
      ],
      pagesAdded: [
        { id: "page1", components: [] }
      ],
      componentsAdded: [
        { id: "text4", type: "text", properties: { content: "{{state.explicitData}}", loadingKey: "explicitDataStatus" }, dataSource: { type: "state", value: "explicitData" } }
      ]
    });

    repairCompiledIntent(intent);

    const mutation = intent.tool_mutation as any;
    const pageUpdates = mutation.pagesUpdated || [];

    // Count triggers for this action
    let triggerCount = 0;
    for (const u of pageUpdates) {
      if (u.pageId === "page1" && u.patch.events) {
        for (const e of u.patch.events) {
          if (e.actionId === "explicit_action") triggerCount++;
        }
      }
    }

    if (triggerCount !== 1) {
      throw new Error(`Expected exactly 1 trigger for explicit action, found ${triggerCount}`);
    }
    
    // Check if it's the converted one (reason: lifecycle_trigger) and NOT implicit_orphan
    const trigger = pageUpdates[0].patch.events.find((e: any) => e.actionId === "explicit_action");
    if (trigger.args?.reason !== "lifecycle_trigger") {
      throw new Error(`Expected trigger reason to be 'lifecycle_trigger', got '${trigger.args?.reason}'`);
    }
  }

  // Test 5: Action dependent on state -> auto-attached (state_change)
  console.log("Test 5: Action dependent on state -> auto-attached (state_change)");
  {
    const intent = createMockIntent({
      actionsAdded: [
        { 
          id: "filter_action", 
          type: "integration_call", 
          config: { 
            assign: "filteredData",
            params: { filter: "{{state.filterValue}}" } 
          } 
        }
      ],
      pagesAdded: [{ id: "page1", components: [] }],
      stateAdded: { filterValue: "" },
      componentsAdded: [
         { id: "text5", type: "text", properties: { content: "{{state.filteredData}}", loadingKey: "filteredDataStatus" }, dataSource: { type: "state", value: "filteredData" } }
      ]
    });

    // Run repair
    repairCompiledIntent(intent);

    // Verify it got attached to state_change
    const action = (intent.tool_mutation as any).actionsAdded[0];
    if (action.triggeredBy?.type !== "state_change" || action.triggeredBy?.stateKey !== "filterValue") {
      throw new Error(`Expected action to be auto-bound to state_change(filterValue), got ${JSON.stringify(action.triggeredBy)}`);
    }

    // Verify validation passes
    expectNotThrows(() => validateCompiledIntent(intent));
  }

  // Test 6: Internal action -> auto-attached (internal)
  console.log("Test 6: Internal action -> auto-attached (internal)");
  {
    const intent = createMockIntent({
      actionsAdded: [
        { 
          id: "orchestration_step", 
          type: "state_mutation", 
          config: { set: { step: 2 } } 
        }
      ],
      pagesAdded: [{ id: "page1", components: [] }],
      stateAdded: { step: 1 },
      componentsAdded: [
         // Add a reader so state usage validation passes
         { id: "step_display", type: "text", properties: { content: "{{state.step}}" } }
      ]
    });

    // Run repair
    repairCompiledIntent(intent);

    // Verify it got attached to internal
    const action = (intent.tool_mutation as any).actionsAdded[0];
    if (action.triggeredBy?.type !== "internal" || action.triggeredBy?.reason !== "system_safety_net") {
      throw new Error(`Expected action to be auto-bound to internal(system_safety_net), got ${JSON.stringify(action.triggeredBy)}`);
    }

    // Verify validation passes
    expectNotThrows(() => validateCompiledIntent(intent));
  }
}

runTests().catch(e => {
  console.error("Tests failed:", e);
  process.exit(1);
});
