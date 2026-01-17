import { materializeSpec } from "../lib/spec/materializer";
import { repairCompiledIntent, validateCompiledIntent } from "../lib/ai/planner-logic";

function assert(condition: any, msg: string) {
  if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

function testMaterializerTwoPhase() {
    console.log("\n--- Test: Materializer Two-Phase Construction ---");
    const baseSpec = { pages: [{ id: "p1", components: [] }], actions: [], state: {} };
    const mutation = {
        componentsAdded: [
            { id: "child1", parentId: "parent1", type: "text", pageId: "p1" }, // Defined BEFORE parent
            { id: "parent1", type: "container", pageId: "p1" }
        ]
    };
    
    try {
        const result = materializeSpec(baseSpec as any, mutation) as any;
        const p1 = result.pages[0];
        const parent = p1.components.find((c: any) => c.id === "parent1");
        assert(parent, "Parent created");
        assert(parent.children && parent.children.length === 1, "Parent has children");
        assert(parent.children[0].id === "child1", "Child attached to parent correctly despite order");
    } catch (e) {
        assert(false, `Materialization crashed: ${e}`);
    }
}

function testPlannerNormalization() {
    console.log("\n--- Test: Planner Action Normalization ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            actionsAdded: [
                { id: "bad_transform", type: "state_transform", config: { source: "a", target: "b" } },
                { id: "weird_flow", type: "custom_flow_step", config: {} },
                { id: "legacy_filter", type: "filter_tool", config: {} }
            ]
        }
    };
    
    let error: any = null;
    try {
        repairCompiledIntent(intent);
    } catch (e: any) {
        error = e;
        console.log(`Caught expected error for legacy_filter: ${e.message}`);
    }
    
    const actions = intent.tool_mutation.actionsAdded;
    const t1 = actions.find((a: any) => a.id === "bad_transform");
    const t2 = actions.find((a: any) => a.id === "weird_flow");
    
    assert(t1.type !== "state_transform", "state_transform type repaired");
    assert(t2.type === "workflow", "custom_flow_step -> workflow");
    assert(
      error && error.meta && error.meta.reason === "DerivedStateAsAction",
      "legacy_filter is rejected as derived state action",
    );
}

function testCanonicalFilterState() {
    console.log("\n--- Test: Canonical Filter State ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            stateAdded: {
                "filter_tool": "all",
                "activityTypeFilter": "closed",
                "time_filter": "today"
            }
        }
    };
    
    repairCompiledIntent(intent);
    
    // Check if canonicalization logic ran (it modifies aliasMap internally, 
    // effectively rewriting keys in stateAdded if we inspect the mutation result logic 
    // but repairCompiledIntent calls canonicalizeStateKeys which applies it)
    
    const state = intent.tool_mutation.stateAdded;
    // Note: The current implementation of canonicalizeStateKeys might delete the old key and add new one
    // Let's check for existence of canonical keys
    
    assert(state["filters.tool"] !== undefined, "filter_tool -> filters.tool");
    assert(state["filters.activityType"] !== undefined, "activityTypeFilter -> filters.activityType");
    assert(state["filters.timeRange"] !== undefined, "time_filter -> filters.timeRange");
    
    assert(state["filter_tool"] === undefined, "Old key removed");
}

function testGraphHealing() {
    console.log("\n--- Test: Action Graph Healing ---");
    const intent: any = {
        intent_type: "create",
        tool_mutation: {
            pagesAdded: [{ pageId: "home", events: [] }],
            actionsAdded: [
                { id: "orphaned_action", type: "internal", config: { code: "console.log('orphan')" } }
            ],
            pagesUpdated: []
        }
    };

    validateCompiledIntent(intent, undefined, { mode: "create" });
    
    const action = intent.tool_mutation.actionsAdded[0];
    const pageUpdate = intent.tool_mutation.pagesUpdated[0];
    
    assert(action.triggeredBy, "Orphan action was auto-triggered");
    assert(Array.isArray(action.triggeredBy) && action.triggeredBy[0].type === "lifecycle", "Trigger type is lifecycle");
    
    assert(pageUpdate, "Page update was created");
    const event = pageUpdate.patch.events.find((e: any) => e.actionId === "orphaned_action");
    assert(event, "Page event was bound to action");
    assert(event.type === "onPageLoad", "Event is onPageLoad");
}

function main() {
    testMaterializerTwoPhase();
    testPlannerNormalization();
    testCanonicalFilterState();
    testGraphHealing();
    console.log("\n🎉 ALL HARDENING TESTS PASSED");
}

main();
