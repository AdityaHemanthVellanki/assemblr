
import { validateCompiledIntent, repairCompiledIntent } from "../lib/ai/planner-logic";

// Mock the ActionType to include state_transform for testing failure
// We can't actually change the enum at runtime easily if it's a const enum, 
// but we can pass a string that matches it.

const invalidIntent = {
  intent_type: "modify",
  tool_mutation: {
    stateAdded: {
      "filters.status": "all",
      "filteredData": []
    },
    actionsAdded: [
      {
        id: "filter_activity",
        type: "state_transform", // INVALID TYPE
        config: {
          transform: "filter",
          source: "rawData",
          target: "filteredData"
        },
        triggeredBy: {
          type: "state_change",
          stateKey: "filters.status"
        }
      }
    ],
    componentsAdded: [
      {
        id: "status_select",
        type: "select",
        properties: { bindKey: "filters.status" }
      }
    ]
  }
};

async function runTest() {
  console.log("--- Regression Test: State Transform Invalid Type ---");
  
  try {
    // This should throw because state_transform is invalid
    validateCompiledIntent(invalidIntent as any);
    console.error("❌ FAIL: Validation accepted 'state_transform' type");
    process.exit(1);
  } catch (e: any) {
    if (e.message.includes("Invalid action type") || e.message.includes("state_transform")) {
      console.log("✅ PASS: Validation correctly rejected 'state_transform'");
    } else {
      console.error(`❌ FAIL: Validation failed but with unexpected error: ${e.message}`);
      // process.exit(1); // Allow to continue to see if we can fix it
    }
  }

  // Now let's try to repair it using the planner logic
  console.log("\n--- Testing Repair Logic ---");
  
  const intentToRepair = JSON.parse(JSON.stringify(invalidIntent));
  
  try {
    repairCompiledIntent(intentToRepair);
    
    // Check if type was converted away from invalid state_transform
    const action = intentToRepair.tool_mutation.actionsAdded[0];
    if (action.type === "state_transform") {
        console.error("❌ FAIL: Repair did not convert 'state_transform'");
        process.exit(1);
    }
    console.log(`✅ PASS: Repaired action type to: ${action.type}`);
    
    // Check if validation passes now
    validateCompiledIntent(intentToRepair);
    console.log("✅ PASS: Repaired intent passed validation");
    
  } catch (e: any) {
    console.error(`❌ FAIL: Repair/Validation failed: ${e.message}`);
    process.exit(1);
  }
}

runTest();
