
import { validateCompiledIntent, repairCompiledIntent } from "../lib/ai/planner-logic";
import { normalizeActionId } from "../lib/spec/action-id";
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
    tool_mutation: {
      pagesUpdated: [{
        pageId: "p1",
        patch: {
          events: [{ type: "onPageLoad", actionId: "missing_action" }]
        }
      }]
    },
    original_user_prompt: "",
    assistant_response_summary: "",
    outcome: "success"
  };
  assertThrows(() => validateCompiledIntent(intentMissingAction), "Trigger references missing action");

  // Test 3: Unreachable Action
  const intentUnreachable: CompiledIntent = {
    intent_type: "modify",
    tool_mutation: {
      actionsAdded: [{ id: "orphan_action", type: "integration_call" }]
    },
    original_user_prompt: "",
    assistant_response_summary: "",
    outcome: "success"
  };
  assertThrows(() => validateCompiledIntent(intentUnreachable), "Action defined but unreachable");

  // Test 4: Repair & Normalization
  console.log("\n--- Test 4: Repair & Normalization ---");
  const intentToRepair: CompiledIntent = {
    intent_type: "modify",
    tool_mutation: {
      actionsAdded: [
        { id: "fetch-data", type: "integration_call", config: { assign: "data" } } // Orphan, kebab-case
      ],
      pagesAdded: [{ id: "p1" }]
    },
    original_user_prompt: "",
    assistant_response_summary: "",
    outcome: "success"
  };
  
  repairCompiledIntent(intentToRepair);
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

  // Test 5: Runtime Registry & Execution
  console.log("\n--- Test 5: Runtime Registry & Execution ---");
  const spec: MiniAppSpec = {
    kind: "mini_app",
    title: "Test App",
    pages: [{ id: "p1", name: "Home", components: [], events: [{ type: "onPageLoad", actionId: "fetch-data" }] }], // Kebab ref
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
