
import { getServerEnv } from "@/lib/env";
import { compileIntent } from "@/lib/ai/planner";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/definitions";
import { normalizeActionId } from "@/lib/spec/action-id";

// Force production mode behavior
process.env.NODE_ENV = "production";

async function runLiveFlowTest() {
  console.log("🚀 Starting Assemblr Live Runtime User Flow Test");
  console.log("=================================================");

  // 1. Bootstrap Real Session
  console.log("\n1. Bootstrapping Real User Session...");
  let sessionContext;
  try {
    sessionContext = await bootstrapRealUserSession();
  } catch (e: any) {
    console.error("❌ Auth Bootstrap Failed:", e.message);
    process.exit(1);
  }
  const { user, orgId } = sessionContext;
  console.log(`✅ Bootstrapped Session: User=${user.email}, Org=${orgId}`);

  // 2. Fetch Connected Integrations for Planner Context
  console.log("\n2. Building Planner Context...");
  const supabase = createSupabaseAdminClient();
  const { data: connections, error } = await supabase
    .from("integration_connections")
    .select("integration_id, status")
    .eq("org_id", orgId)
    .eq("status", "active");

  if (error || !connections || connections.length === 0) {
    console.error("❌ No connected integrations found. Test cannot proceed.");
    process.exit(1);
  }

  const plannerContext: any = {
    integrations: {}
  };

  connections.forEach((conn: any) => {
    plannerContext.integrations[conn.integration_id] = {
      connected: true,
      capabilities: CAPABILITY_REGISTRY.filter(c => c.integrationId === conn.integration_id).map(c => c.id),
      scopes: ["default"] // Simplified
    };
  });

  console.log(`✅ Planner Context Ready (${Object.keys(plannerContext.integrations).length} integrations)`);

  // 3. Compile Intent (Planner)
  const prompt = "Show my latest email";
  console.log(`\n3. Running Planner with prompt: "${prompt}"...`);
  
  let intent;
  try {
    intent = await compileIntent(
      prompt,
      [], // history
      plannerContext,
      [], // schemas
      [], // metrics
      "create",
      [], // policies
      undefined // currentSpec
    );
  } catch (e: any) {
    console.error("❌ Planner Failed:", e);
    process.exit(1);
  }

  // 4. Validate Planner Output (Root Causes Check)
  console.log("\n4. Validating Planner Output...");
  const actions = intent.tool_mutation?.actionsAdded || [];
  const components = intent.tool_mutation?.componentsAdded || [];

  if (actions.length === 0) {
    console.error("❌ No actions generated.");
    process.exit(1);
  }

  // Root Cause #1 Check: Integration Field
  const integrationCalls = actions.filter((a: any) => a.type === "integration_call");
  if (integrationCalls.length === 0) {
      console.warn("⚠️ No integration_call actions generated. Planner might have used internal mock?");
  }

  // Root Cause #3 Check: UI Tree
  components.forEach((c: any) => {
    if (c.children && !Array.isArray(c.children)) {
      console.error(`❌ Component ${c.id} has invalid children (not array):`, c.children);
      process.exit(1);
    }
  });
  console.log("✅ UI Tree Structure Valid");

  // 5. Simulate Persistence (JSON cycle)
  console.log("\n5. Simulating Persistence (JSON Serialize/Deserialize)...");
  const serialized = JSON.stringify(intent);
  const hydratedSpec = JSON.parse(serialized);
  
  // 6. Runtime Hydration
  console.log("\n6. Hydrating Runtime Registry...");
  const registry = new RuntimeActionRegistry(orgId);
  const hydratedActions = hydratedSpec.tool_mutation?.actionsAdded || [];
  
  for (const action of hydratedActions) {
    try {
        await registry.registerAction(action);
    } catch (e: any) {
        console.error(`❌ Failed to register action ${action.id}:`, e.message);
        process.exit(1);
    }
  }
  console.log(`✅ Hydrated ${hydratedActions.length} actions.`);

  // 7. Find Entry Point (onPageLoad)
  console.log("\n7. Determining Execution Entry Point...");
  const pages = hydratedSpec.tool_mutation?.pagesAdded || [];
  let entryActionId: string | undefined;

  for (const p of pages) {
    if (p.events) {
      const load = p.events.find((e: any) => e.type === "onPageLoad");
      if (load && load.actionId) {
        entryActionId = load.actionId;
        break;
      }
    }
  }

  // Fallback: Find the integration call directly if not bound (though graph healing should have bound it)
  if (!entryActionId) {
      const call = hydratedActions.find((a: any) => a.type === "integration_call");
      if (call) entryActionId = call.id;
  }

  if (!entryActionId) {
    console.error("❌ No entry point action found.");
    process.exit(1);
  }

  const normalizedEntryId = normalizeActionId(entryActionId);
  if (!registry.has(normalizedEntryId)) {
    console.error(`❌ Action ${normalizedEntryId} missing in registry (Root Cause #2 Mismatch?)`);
    process.exit(1);
  }
  console.log(`✅ Entry Point Found: ${normalizedEntryId}`);

  // 8. Execute Action
  console.log(`\n8. Executing Action ${normalizedEntryId}...`);
  try {
    const result = await registry.executeAction(normalizedEntryId, {}, { orgId, userId: user.id });
    console.log("✅ Execution Result:", JSON.stringify(result, null, 2).substring(0, 500) + "...");
    
    if (Array.isArray(result) && result.length > 0) {
        console.log("✅ Real Data Verified (Array returned)");
    } else {
        console.warn("⚠️ Execution returned empty or non-array data. Verify if this is expected.");
    }

  } catch (e: any) {
    console.error("❌ Execution Failed:", e);
    process.exit(1);
  }

  console.log("\n✅ LIVE FLOW TEST PASSED");
}

runLiveFlowTest().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
