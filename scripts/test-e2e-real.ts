import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoMocks } from "@/lib/core/guard";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { processToolChat } from "@/lib/ai/tool-chat";
import { IntegrationId, isToolSystemSpec } from "@/lib/toolos/spec";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";

async function runTest() {
  assertNoMocks();
  console.log("🚀 Starting Assemblr End-to-End Real System Test");

  let sessionContext;
  try {
    sessionContext = await bootstrapRealUserSession();
  } catch (e: any) {
    console.error("❌ Auth Bootstrap Failed:", e.message);
    process.exit(1);
  }
  const { user, orgId } = sessionContext;
  console.log(`✅ Bootstrapped Session: User=${user.email}, Org=${orgId}`);

  getServerEnv();

  const scenarios = [
    {
      name: "Multi-Integration",
      prompt:
        "Create a dashboard with Gmail emails, GitHub repos, Linear issues, Slack messages, and Notion pages.",
    },
  ];

  const supabase = createSupabaseAdminClient();

  for (const scenario of scenarios) {
    console.log(`\n--- Scenario: ${scenario.name} ---`);
    try {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({ org_id: orgId, name: `E2E ${scenario.name}`, spec: {} as any })
        .select("id")
        .single();
      if (projectError || !project) {
        throw new Error("Failed to create tool");
      }

      const result = await processToolChat({
        orgId,
        toolId: project.id,
        currentSpec: {},
        messages: [],
        userMessage: scenario.prompt,
        connectedIntegrationIds: [],
        mode: "create",
        integrationMode: "auto",
      });

      if (!result.spec || !isToolSystemSpec(result.spec)) {
        throw new Error("Compiler failed to produce a tool system");
      }

      await supabase
        .from("projects")
        .update({ spec: result.spec as any })
        .eq("id", project.id);

      const integrations = result.spec.integrations.map((s) => s.id);
      const expected: IntegrationId[] = ["google", "github", "linear", "slack", "notion"];
      const missing = expected.filter((id) => !integrations.includes(id));
      if (missing.length > 0) {
        throw new Error(`Missing integrations: ${missing.join(", ")}`);
      }
      const compiledTool = buildCompiledToolArtifact(result.spec);
      for (const integration of expected) {
        const action = result.spec.actions.find((a) => a.integrationId === integration);
        if (!action) {
          console.error(`❌ Missing action for ${integration}`);
          continue;
        }
        try {
          const exec = await executeToolAction({
            orgId,
            toolId: project.id,
            compiledTool,
            actionId: action.id,
            input: {},
          });
          const view = result.spec.views.find((v) => v.actions.includes(action.id));
          if (view) {
            const projection = renderView(result.spec, exec.state, view.id);
            console.log(`✅ View (${integration}):`, projection);
          } else {
            console.log(`✅ Action (${integration}) executed`);
          }
        } catch (err: any) {
          console.error(`❌ Action Failed (${integration}):`, err?.message || err);
        }
      }
    } catch (e: any) {
      console.error("❌ Execution Failed:", e);
    }
  }

  console.log("\n✅ All Scenarios Completed");
}

runTest().catch((err) => {
  console.error("❌ E2E Test Failed:", err);
  process.exit(1);
});
