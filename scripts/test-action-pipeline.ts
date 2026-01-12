
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

  // Test 2b: Strict Mode (Lifecycle references missing action)
  const intentMissingLifecycleAction: CompiledIntent = {
    intent_type: "modify",
    tool_mutation: {
        toolPropsUpdated: { title: "Test" },
        // We need to mock a full spec structure for validateSpec to catch this if it was checking lifecycle directly
        // But validateCompiledIntent checks *mutation* references. 
        // Let's rely on validateSpec being called during materialization if we were testing materializer.
        // For planner-logic, we check triggers.
    },
    original_user_prompt: "",
    assistant_response_summary: "",
    outcome: "success"
  };
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
