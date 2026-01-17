import { validateCompiledIntent, repairCompiledIntent } from "../lib/ai/planner-logic";

function assert(condition: any, msg: string) {
  if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      process.exit(1);
  }
  console.log(`✅ PASSED: ${msg}`);
}

function testInvalidActionTypeRepair() {
    console.log("\n--- Test: Invalid Action Type Repair ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            actionsAdded: [
                { id: "transform_data", type: "state_transform", config: { source: "a", target: "b", transform: "map" }, triggeredBy: { type: "state_change", stateKey: "a" } }
            ]
        }
    };
    repairCompiledIntent(intent);
    
    try {
        validateCompiledIntent(intent);
        assert(true, "Repaired action passes validation");
    } catch (e) {
        assert(false, `Validation failed: ${e}`);
    }
}

function testStatusActionRemoval() {
    console.log("\n--- Test: Status Action Removal ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            actionsAdded: [
                { id: "set_status_loading", type: "state_mutation", config: { updates: { "dataStatus": "loading" } }, triggeredBy: { type: "component_event", componentId: "btn", event: "onClick" } }
            ]
        }
    };
    repairCompiledIntent(intent);
    assert(intent.tool_mutation.actionsAdded.length === 0, "Removed explicit status action");
}

function testFilterActionConversion() {
    console.log("\n--- Test: Filter Action Conversion ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            stateAdded: { "filters.status": "all" },
            componentsAdded: [
                { id: "list1", type: "list", dataSource: { type: "state", value: "filteredData" } }
            ],
            actionsAdded: [
                { 
                    id: "filter_list", 
                    type: "internal", 
                    config: { 
                        operation: "assign", 
                        assign: { "filteredData": { deriveFrom: ["rawData"], logic: "filter" } } 
                    },
                    triggeredBy: { type: "state_change", stateKey: "filters.status" }
                }
            ]
        }
    };
    repairCompiledIntent(intent);
    
    const list = intent.tool_mutation.componentsAdded[0];
    assert(list.dataSource.type === "derived", "Converted dataSource to derived");
    assert(list.dataSource.source === "rawData", "Preserved source key");
    assert(list.dataSource.filters.includes("filters.status"), "Inferred filter dependency");
    
    assert(intent.tool_mutation.actionsAdded.length === 0, "Removed filter action");
}

function testUntriggeredActionRescue() {
    console.log("\n--- Test: Untriggered Action Rescue ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            pagesAdded: [{ id: "p1", components: [] }],
            actionsAdded: [
                { id: "orphan", type: "integration_call", config: { assign: "data" } }
            ]
        }
    };
    repairCompiledIntent(intent);
    const action = intent.tool_mutation.actionsAdded[0];
    const trigger = action.triggeredBy;
    assert(trigger.type === "lifecycle" && trigger.event === "onPageLoad", "Bound orphan to onPageLoad");
    
    const pageUpdate = intent.tool_mutation.pagesUpdated[0];
    assert(pageUpdate.patch.events.some((e: any) => e.actionId === "orphan"), "Updated page events");
}

function testEffectOnlyValidation() {
    console.log("\n--- Test: Effect-Only Validation ---");
    const intent: any = {
        intent_type: "modify",
        tool_mutation: {
            actionsAdded: [
                { id: "open_link", type: "integration_call", effectOnly: true, triggeredBy: { type: "component_event", componentId: "btn", event: "onClick" } }
            ],
            componentsAdded: [
                { id: "btn", type: "button", events: [{ type: "onClick", actionId: "open_link" }] }
            ]
        }
    };
    repairCompiledIntent(intent); // Should not fail
    try {
        validateCompiledIntent(intent);
        assert(true, "Effect-only action passed validation");
    } catch (e) {
        assert(false, `Validation failed: ${e}`);
    }
}

function main() {
    testInvalidActionTypeRepair();
    testStatusActionRemoval();
    testFilterActionConversion();
    testUntriggeredActionRescue();
    testEffectOnlyValidation();
    console.log("\n🎉 ALL SYSTEM STABILITY TESTS PASSED");
}

main();
