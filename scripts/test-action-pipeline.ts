
import { validateCompiledIntent, repairCompiledIntent } from "../lib/ai/planner-logic";
import { normalizeActionId } from "../lib/spec/action-id";
import { ActionRegistry } from "../lib/spec/action-registry";
import { MiniAppStore } from "../components/miniapp/runtime";
import { CompiledIntent } from "../lib/core/intent";
import { MiniAppSpec } from "../lib/spec/miniAppSpec";

async function runTests() {
  console.log("Running Action Pipeline Tests...");
  let failures = 0;

  const assert = (condition: boolean, msg: string) => {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  };

  const assertThrows = (fn: () => void, msg: string) => {
    try {
      fn();
      console.error(`❌ FAIL: ${msg} (Did not throw)`);
      failures++;
    } catch (e: any) {
      console.log(`✅ PASS: ${msg} (Threw: ${e.message})`);
    }
  };

  // Test 1: Normalization Logic
  console.log("\n--- Test 1: Normalization Logic ---");
  assert(normalizeActionId("fetch-github-activity") === "fetch_github_activity", "kebab -> snake");
  assert(normalizeActionId("fetchGitHubActivity") === "fetchgithubactivity", "camel -> lower"); // My util lowers everything
  assert(normalizeActionId("Fetch Data") === "fetch_data", "spaces -> snake");

  // Test 2: Strict Mode Validation (Missing Action)
  console.log("\n--- Test 2: Strict Mode Validation ---");
  const intentMissingAction: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      pagesUpdated: [{
        pageId: "p1",
        patch: {
          events: [{ type: "onPageLoad", actionId: "missing_action" }]
        }
      }]
    },
    outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentMissingAction), "Trigger references missing action");

  // Test 2b: Strict Mode (Lifecycle references missing action)
  const intentMissingLifecycleAction: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
        toolPropsUpdated: { title: "Test" },
    },
    outcome: "success"
  } as any;
  // Note: validateCompiledIntent mostly checks what's IN the mutation. 
  // If we want to test materializer validation, we should call materializeSpec.

  // Test 2c: Materializer Validation
  console.log("\n--- Test 2c: Materializer Validation ---");
  const baseSpec = { kind: "mini_app", title: "Test", pages: [], actions: [], state: {} };
  const mutationWithBadLifecycle: any = { // ToolMutation type
      // We can't easily inject lifecycle via standard ToolMutation unless we use a backdoor or if ToolMutation supports it.
      // Wait, ToolMutation doesn't have 'lifecycleUpdated'. It's missing from the type definition in materializer.ts snippet I saw.
      // If the user wants lifecycle updates, they usually come via... where?
      // Checking miniAppSpec.ts, lifecycle is part of the spec.
      // Checking ToolMutation in materializer.ts: 
      // It has toolPropsUpdated, pagesAdded, etc. NO lifecycleUpdated.
      // How does lifecycle get added? 
      // Maybe it's not supported in mutation yet?
      // If so, that's a gap.
      // BUT, the user issue is about `onPageLoad` which is a PAGE event.
      // Page events ARE supported in pagesUpdated.
  };
  
  // Let's test Page Event validation in Materializer
  const badPageUpdate = {
      pagesUpdated: [{
          pageId: "p1",
          patch: {
              events: [{ type: "onPageLoad", actionId: "ghost_action" }]
          }
      }]
  };
  // We need a base spec with page p1
  const specWithPage: any = { 
      kind: "mini_app", title: "Test", 
      pages: [{ id: "p1", name: "Home", components: [] }], 
      actions: [], 
      state: {} 
  };
  
  const { materializeSpec } = require("../lib/spec/materializer");
  assertThrows(() => materializeSpec(specWithPage, badPageUpdate), "Page update references missing action");

  // Test 3: Unreachable Action
  const intentUnreachable: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [{ id: "orphan_action", type: "integration_call" }]
    },
    outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentUnreachable), "Action defined but unreachable");

  // Test 4: Repair & Normalization
  console.log("\n--- Test 4: Repair & Normalization ---");
  const intentToRepair: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    constraints: [],
    integrations_required: [],
    output_mode: "mini_app",
    execution_graph: { nodes: [], edges: [] },
    execution_policy: { deterministic: true, parallelizable: false, retries: 0 },
    tool_mutation: {
      actionsAdded: [
        { id: "fetch-data", type: "integration_call", config: { assign: "data" } } // Orphan, kebab-case
      ],
      pagesAdded: [{ id: "p1" }],
      componentsAdded: [
        { id: "c1", type: "text", dataSource: { type: "state", value: "data" } }
      ]
    },
    outcome: "success"
  } as any;
  
  repairCompiledIntent(intentToRepair);
  // @ts-ignore
  const repairedAction = intentToRepair.tool_mutation.actionsAdded[0];
  assert(repairedAction.id === "fetch_data", "Action ID normalized in repair");
  assert(repairedAction.triggeredBy?.type === "lifecycle", "Orphan action auto-bound to lifecycle");
  
  // Verify it passes validation now
  try {
    validateCompiledIntent(intentToRepair);
    console.log("✅ PASS: Repaired intent passes validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Repaired intent failed validation: ${e.message}`);
    failures++;
  }

  // Test 4b: Repair Integration Pipeline (Auto-Inject Normalizer)
  console.log("\n--- Test 4b: Repair Integration Pipeline ---");
  const intentPipeline: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    tool_mutation: {
      actionsAdded: [
        { id: "fetch_raw_data", type: "integration_call", config: { assign: "rawData" } }
      ],
      pagesAdded: [{ id: "p1" }],
      componentsAdded: [
        { id: "list1", type: "list", dataSource: { type: "state", value: "rawItems" } } // Binds to FUTURE normalized data
      ]
    },
    outcome: "success"
  } as any;

  repairCompiledIntent(intentPipeline);
  const actions = intentPipeline.tool_mutation!.actionsAdded!;
  const normalizer = actions.find((a: any) => a.id === "normalize_raw_data");
  assert(!!normalizer, "Auto-injected normalization action");
  assert(normalizer?.config?.assign === "rawItems", "Normalizer assigns to expected key");
  assert(normalizer?.triggeredBy?.type === "state_change" && normalizer.triggeredBy.stateKey === "rawData", "Normalizer triggered by raw data change");
  
  // Test Option A: Direct binding (No status mapper)
  const listComp = intentPipeline.tool_mutation!.componentsAdded![0];
  // Note: logic wires loadingKey to *integration* status (rawDataStatus)
  assert(listComp.properties?.loadingKey === "rawDataStatus", "Auto-wired loadingKey");
  assert(listComp.properties?.errorKey === "rawDataError", "Auto-wired errorKey");
  
  try {
      validateCompiledIntent(intentPipeline);
      console.log("✅ PASS: Pipeline intent passes validation");
  } catch (e: any) {
      console.error(`❌ FAIL: Pipeline intent failed validation: ${e.message}`);
      failures++;
  }

  // Test 4c: Status Mirroring for Generic List
  console.log("\n--- Test 4c: Status Mirroring for Generic List ---");
  const intentGenericList: CompiledIntent = {
    intent_type: "modify",
    system_goal: "test",
    tool_mutation: {
      actionsAdded: [
        { id: "fetch_github_commits", type: "integration_call", config: { assign: "github_commits" } }
      ],
      pagesAdded: [{ id: "p1" }],
      componentsAdded: [
        { id: "list_generic", type: "list", dataSource: { type: "state", value: "filteredActivity" }, properties: { loadingKey: "activityListStatus", errorKey: "activityListError" } }
      ]
    },
    outcome: "success"
  } as any;
  repairCompiledIntent(intentGenericList);
  const mirror = intentGenericList.tool_mutation!.actionsAdded!.find((a: any) => a.id === "mirror_status_github_commits");
  assert(!!mirror, "Injected status mirroring action");
  assert(Array.isArray(mirror.triggeredBy) && mirror.triggeredBy.length === 2, "Mirroring action triggered by both status and error changes");
  assert(mirror.type === "workflow" && Array.isArray(mirror.steps) && mirror.steps[0].type === "state_mutation", "Mirroring uses state_mutation step");
  try {
    validateCompiledIntent(intentGenericList);
    console.log("✅ PASS: Generic list intent passes validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Generic list intent failed validation: ${e.message}`);
    failures++;
  }

  // Test 6: New Validation Rules
  console.log("\n--- Test 6: New Validation Rules ---");
  const intentBadType: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
          actionsAdded: [{ id: "bad", type: "custom_function" }]
      },
      outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentBadType), "Invalid action type");

  // Test 6b: state_update is repaired to internal
  const intentStateUpdate: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
          actionsAdded: [{
              id: "update_filter_state",
              type: "state_update",
              config: { updates: { "filters.type": "{{ state.filters.type }}", "filters.integration": "{{ state.filters.integration }}" } },
              triggeredBy: { type: "lifecycle", event: "onPageLoad" }
          }]
      },
      outcome: "success"
  } as any;
  repairCompiledIntent(intentStateUpdate);
  const upd = intentStateUpdate.tool_mutation!.actionsAdded![0] as any;
  assert(upd.type === "internal", "Converted state_update to internal");
  assert(Array.isArray(upd.steps) && upd.steps[0]?.type === "state_mutation", "Added explicit state_mutation step");
  try {
    validateCompiledIntent(intentStateUpdate);
    console.log("✅ PASS: Repaired state_update intent passes validation");
  } catch (e: any) {
    console.error(`❌ FAIL: Repaired state_update intent failed validation: ${e.message}`);
    failures++;
  }

  const intentBadClick: CompiledIntent = {
      intent_type: "modify",
      tool_mutation: {
          componentsAdded: [{ 
              id: "l1", type: "list", 
              properties: { itemTemplate: { onClick: "some_action" } } 
          }]
      },
      outcome: "success"
  } as any;
  assertThrows(() => validateCompiledIntent(intentBadClick), "defines onClick on itemTemplate");


  console.log("\n--- Test 5: Runtime Registry & Execution ---");
  const spec: MiniAppSpec = {
    kind: "mini_app",
    title: "Test App",
    state: {},
    pages: [{ id: "p1", name: "Home", layoutMode: "grid", components: [], events: [{ type: "onPageLoad", actionId: "fetch-data" }] }], // Kebab ref
    actions: [{ id: "fetch_data", type: "integration_call" }] // Snake def
  };

  let callCount = 0;
  const mockIntegrations = {
    call: async (id: string, args: any) => {
      console.log(`Mock integration called: ${id}`);
      if (id === "fetch_data") callCount++;
      return { status: "success", rows: [] } as any;
    }
  };

  try {
    const store = new MiniAppStore(spec, mockIntegrations, {});
    // Simulate page load dispatch
    await store.dispatch("fetch-data", {}, { event: "onPageLoad" }); // Dispatch with kebab
    assert(callCount === 1, "Runtime executed action despite ID mismatch (normalized)");
    
    const action = store.getAction("fetch-data");
    assert(!!action, "Runtime found action via kebab-case lookup");
  } catch (e: any) {
    console.error(`❌ FAIL: Runtime test error: ${e.message}`);
    failures++;
  }

  if (failures === 0) {
    console.log("\n🎉 ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.error(`\n❌ ${failures} TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error(e);
  process.exit(1);
});
