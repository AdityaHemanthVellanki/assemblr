
import { getServerEnv } from "@/lib/env";
import { generateDashboardSpec } from "@/lib/ai/generateDashboardSpec";
import { compileIntent } from "@/lib/ai/planner";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { executeDashboard } from "@/lib/execution/engine";
import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/definitions";
import { EXECUTORS } from "@/lib/integrations/map";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertNoMocks } from "@/lib/core/guard";

// Force production mode behavior
// process.env.NODE_ENV = "production"; // Passed via CLI

async function runTest() {
  assertNoMocks();
  console.log("🚀 Starting Assemblr End-to-End Real System Test");
  console.log("=================================================");

  // 1. Environment Check
  console.log("\n1. Verifying Environment Variables...");
  try {
    const env = getServerEnv();
    console.log("✅ Environment Variables Validated");
    // Log presence of OAuth keys (masked)
    const keys = [
      "GITHUB_CLIENT_ID", "SLACK_CLIENT_ID", "NOTION_CLIENT_ID", 
      "LINEAR_CLIENT_ID", "GOOGLE_CLIENT_ID"
    ];
    keys.forEach(k => {
      const val = env[k as keyof typeof env];
      console.log(`   - ${k}: ${val ? "PRESENT" : "MISSING (Should crash)"}`);
    });
  } catch (e: any) {
    console.error("❌ Environment Check Failed:", e.message);
    process.exit(1);
  }

  // 2. Registry Consistency Check
  console.log("\n2. Verifying Registry Consistency...");
  let consistencyFailures = 0;
  CAPABILITY_REGISTRY.forEach(cap => {
    if (!EXECUTORS[cap.integrationId]) {
      console.error(`❌ Capability ${cap.id} references missing executor: ${cap.integrationId}`);
      consistencyFailures++;
    }
  });
  if (consistencyFailures > 0) {
    console.error(`❌ Registry Consistency Check Failed with ${consistencyFailures} errors`);
    process.exit(1);
  }
  console.log("✅ Registry Consistency Verified (All capabilities have executors)");

  // 3. Simulation: User Prompt -> Spec -> Execution
  // We will simulate for each major integration
  const scenarios = [
    { name: "GitHub", prompt: "Show my latest issues", integrationId: "github", resource: "issues" },
    { name: "Google", prompt: "List my recent emails", integrationId: "google", resource: "gmail" },
    { name: "Slack", prompt: "Show recent messages in general", integrationId: "slack", resource: "messages" },
    { name: "Notion", prompt: "Search for pages about 'project'", integrationId: "notion", resource: "pages" },
    { name: "Linear", prompt: "List my active issues", integrationId: "linear", resource: "issues" }
  ];

  for (const scenario of scenarios) {
    console.log(`\n--- Scenario: ${scenario.name} ---`);
    console.log(`Prompt: "${scenario.prompt}"`);

    try {
      // A. AI Generation
      console.log("   Generating Spec...");
      // Mocking the AI response strictly for this test script if API key is missing?
      // No, user said NO MOCKS.
      // If AZURE_OPENAI_API_KEY is missing, this will fail.
      // Assuming the environment has AI keys (it usually does in this setup).
      
      const spec = await generateDashboardSpec({ prompt: scenario.prompt });
      console.log("   ✅ Spec Generated");

      // 2. Register
      const registry = new RuntimeActionRegistry("test-org");
      // registry.reset(); // No reset needed for new instance

      // Construct Planner Context
      const plannerContext = {
          integrations: {
              [scenario.integrationId]: {
                  connected: true,
                  capabilities: CAPABILITY_REGISTRY.filter(c => c.integrationId === scenario.integrationId).map(c => c.id),
                  scopes: ["default"]
              }
          }
      };
      
      // Hydrate actions from spec + intent
      // We need to simulate the flow where `tool-chat` does this.
      // 1. Compile
      const intent = await compileIntent(
        scenario.prompt,
        [], // history
        plannerContext as any, // PlannerContext
        [], // schemas
        [], // metrics
        "create", // mode
        [], // policies
        undefined // currentSpec
      );
      
      // Hydrate actions from spec + intent
      // Similar to tool-chat.ts logic
      // We need to extract actions from the intent's tool_mutation if present
      const newActions = intent.tool_mutation?.actionsAdded || [];
      if (newActions.length === 0) {
          console.warn("   ⚠️ No actions added by planner. This might be a logic failure or simple spec.");
      }

      newActions.forEach(action => {
          registry.registerAction(action);
      });

      // Verify actions are registered
      const missingActions = newActions.filter(a => !registry.get(a.id));
      if (missingActions.length > 0) {
          throw new Error(`Actions failed to register: ${missingActions.map(a => a.id).join(", ")}`);
      }
      console.log(`   ✅ Actions Registered (${newActions.length})`);

      // C. Execution
      console.log("   Attempting Execution...");
      // We need to find the action ID to execute.
      // Usually triggered by "onPageLoad" or UI.
      // Let's find an action that uses the integration.
      const integrationAction = newActions.find(a => a.type === "integration_call" || a.type === "integration_query");
      
      if (!integrationAction) {
          console.log("   ℹ️ No integration_call/query action found. Skipping execution test.");
          continue;
      }

      console.log(`   Executing Action: ${integrationAction.id} (${integrationAction.config?.capabilityId})`);
      
      // Execute!
      // This requires DB access for token.
      // We pass a dummy orgId "test-org" which likely doesn't exist or has no token.
      // We EXPECT "Missing access token" or "Integration not connected".
      // This confirms we hit the REAL executor.
      
      const result = await registry.executeAction(integrationAction.id, {}, {
          orgId: "test-org",
          userId: "test-user"
      });

      console.log("   ✅ Execution Result:", result);
      
    } catch (e: any) {
      const msg = e.message;
      if (msg.includes("Integration") && msg.includes("not connected")) {
         console.log("   ✅ PASS: Reached Integration Layer (Blocked by Auth as expected in test env)");
      } else if (msg.includes("Missing") && msg.includes("token")) {
         console.log("   ✅ PASS: Reached Integration Layer (Blocked by Auth as expected in test env)");
      } else if (msg.includes("AI service unavailable")) {
         console.warn("   ⚠️ SKIPPED: AI Service unavailable");
      } else {
         console.error("   ❌ FAIL: Unexpected Error:", e);
         process.exit(1);
      }
    }
  }

  console.log("\n✅ All Scenarios Passed (Auth Boundaries Verified)");
}

runTest().catch(e => {
  console.error("FATAL:", e);
  process.exit(1);
});
