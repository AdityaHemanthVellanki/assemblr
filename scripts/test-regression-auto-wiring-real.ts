
// Patch server-only to be a no-op in this test environment
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request: string, parent: any, isMain: boolean) {
  if (request === "server-only") {
    return {};
  }
  return originalLoad(request, parent, isMain);
};

// Load env vars
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// Try .env.local first, then .env
const envLocal = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envLocal)) {
    dotenv.config({ path: envLocal });
} else {
    dotenv.config({ path: path.resolve(__dirname, "../.env") });
}

// Force production mode behavior
process.env.NODE_ENV = "production";

// Dynamic imports to allow patch to take effect
async function runDeterministicTest() {
    const { validateCompiledIntent } = await import("../lib/ai/planner-logic");
    
    console.log("\n0. Running Deterministic Hallucination Cleanup Test...");
    
    const badIntent: any = {
        intent_type: "create",
        tool_mutation: {
            actionsAdded: [],
            componentsAdded: [
                { id: "auto_list_hallucinated", type: "list", pageId: "main", children: ["auto_item_1"] }, // Should be removed
                { id: "valid_container", type: "container", pageId: "main", children: ["auto_list_hallucinated", "other_valid"] } // Reference should be cleaned
            ],
            pagesAdded: [
                { id: "main", components: [{ id: "valid_container" }, { id: "auto_list_hallucinated" }], events: [] } // Reference should be cleaned
            ]
        },
        execution_graph: { nodes: [], edges: [] }
    };

    try {
        validateCompiledIntent(badIntent);
    } catch (e) {
        // Ignore validation errors about missing actions, we just want to check cleanup
        console.log("   (Ignored validation error during cleanup test: " + (e as any).message + ")");
    }

    const m = badIntent.tool_mutation;
    
    // Check componentsAdded
    const hasAuto = m.componentsAdded.some((c: any) => c.id === "auto_list_hallucinated");
    if (hasAuto) throw new Error("❌ FAILED: auto_list_hallucinated was NOT removed from componentsAdded.");
    
    // Check page components
    const pageHasAuto = m.pagesAdded[0].components.some((c: any) => c.id === "auto_list_hallucinated");
    if (pageHasAuto) throw new Error("❌ FAILED: auto_list_hallucinated was NOT removed from page.components.");
    
    // Check container children
    const container = m.componentsAdded.find((c: any) => c.id === "valid_container");
    const childHasAuto = container.children.includes("auto_list_hallucinated");
    if (childHasAuto) throw new Error("❌ FAILED: auto_list_hallucinated was NOT removed from valid_container.children.");

    console.log("✅ Deterministic Cleanup Test PASSED.");
}

async function runRegressionTest() {
  const { compileIntent } = await import("../lib/ai/planner");
  const { assertNoMocks } = await import("../lib/core/guard");
  const { PlannerContext } = await import("../lib/ai/types"); // Type import only, but we need it for TS to be happy? No, types are elided.
  
  console.log("🚀 Starting Auto-Wiring Regression Test (Production Mode)");
  
  // Run deterministic test first
  await runDeterministicTest();

  // 1. Setup
  assertNoMocks();
  
  const prompt = "show my latest emails";
  console.log(`\n1. Generating Spec for prompt: "${prompt}"...`);
  
  const context = {
      integrations: {
          google: {
              connected: true,
              capabilities: ["google_gmail_list", "google_calendar_list"],
              scopes: ["https://www.googleapis.com/auth/gmail.readonly"]
          }
      }
  };

  try {
    const intent = await compileIntent(
        prompt,
        [],
        context,
        [], // schemas
        [], // metrics
        "create"
    );
    console.log("✅ Intent Compiled successfully");
    
    const mutation = intent.tool_mutation;
    if (!mutation) {
        throw new Error("❌ FAILED: No tool mutation returned.");
    }

    // 2. Inspect Components for Duplicates
    console.log("\n2. Verifying Component Integrity...");
    
    const componentsAdded = mutation.componentsAdded || [];
    const pagesAdded = mutation.pagesAdded || [];
    
    // Check for duplicates in componentsAdded
    const ids = componentsAdded.map((c: any) => c.id);
    const duplicates = ids.filter((item: any, index: any) => ids.indexOf(item) !== index);
    if (duplicates.length > 0) {
        throw new Error(`❌ FAILED: Duplicate component IDs found in componentsAdded: ${duplicates.join(", ")}`);
    }
    console.log("✅ No duplicate component IDs in componentsAdded.");
    
    // Check for ID-only stubs in componentsAdded
    const stubs = componentsAdded.filter((c: any) => !c.type);
    if (stubs.length > 0) {
        throw new Error(`❌ FAILED: Found components without type (stubs) in componentsAdded: ${stubs.map((c: any) => c.id).join(", ")}`);
    }
    console.log("✅ No ID-only stubs in componentsAdded.");

    // Check pagesAdded components for duplicates or stubs
    if (pagesAdded.length > 0) {
        for (const p of pagesAdded) {
            if (p.components) {
                const pIds = p.components.map((c: any) => typeof c === 'string' ? c : c.id);
                // Check if any ID appears twice
                const pDupes = pIds.filter((item: any, index: any) => pIds.indexOf(item) !== index);
                if (pDupes.length > 0) {
                     throw new Error(`❌ FAILED: Duplicate component IDs found in page '${p.id}': ${pDupes.join(", ")}`);
                }
                
                // Check if we have auto_list stubs that are NOT in componentsAdded
                for (const id of pIds) {
                    if (id.startsWith("auto_list_")) {
                        const exists = componentsAdded.some((c: any) => c.id === id);
                        if (!exists) {
                             throw new Error(`❌ FAILED: Page references auto-component '${id}' which is NOT defined in componentsAdded.`);
                        }
                    }
                }
            }
        }
    }
    console.log("✅ Page component references are valid.");
    
    // 3. Verify Auto-Wiring
    console.log("\n3. Verifying Auto-Wiring...");
    const autoLists = componentsAdded.filter((c: any) => c.id.startsWith("auto_list_"));
    
    if (autoLists.length === 0) {
        console.warn("⚠️ WARNING: No auto_list components found. Checking for manual lists...");
        const lists = componentsAdded.filter((c: any) => c.type === "list");
        if (lists.length === 0) {
             throw new Error("❌ FAILED: No list component generated for 'show emails'.");
        }
        console.log(`ℹ️ Planner generated manual list: ${lists[0].id}`);
    } else {
        console.log(`✅ Found auto-wired list: ${autoLists[0].id}`);
        if (autoLists.length > 1) {
             throw new Error(`❌ FAILED: Multiple auto_list components found: ${autoLists.map((c: any) => c.id).join(", ")}`);
        }
    }
    
    // 4. Verify Semantic Consumption
    const actions = mutation.actionsAdded || [];
    const emailAction = actions.find((a: any) => 
        (a.type === "integration_call" || a.type === "integration_query") && 
        (a.id.includes("email") || a.id.includes("gmail"))
    );
    
    if (!emailAction) {
        throw new Error("❌ FAILED: No email fetching action found.");
    }
    console.log(`✅ Found email action: ${emailAction.id}`);
    
    // Check if UI binds to it
    const isConsumed = componentsAdded.some((c: any) => {
        // Direct state binding
        if (c.dataSource?.type === "state" && c.dataSource.value && (c.dataSource.value === emailAction.config?.assign || c.dataSource.value.includes(emailAction.id))) return true;
        // Derived
        if (c.dataSource?.type === "derived" && c.dataSource.source && (c.dataSource.source === emailAction.config?.assign || c.dataSource.source.includes(emailAction.id))) return true;
        return false;
    });
    
    if (!isConsumed) {
         throw new Error(`❌ FAILED: Action ${emailAction.id} data is not consumed by any component.`);
    }
    console.log("✅ UI correctly consumes email data.");

    console.log("\n🎉 Regression Test PASSED: Auto-wiring is clean.");
    process.exit(0);

  } catch (err: any) {
    console.error("\n❌ Regression Test FAILED:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

runRegressionTest();
