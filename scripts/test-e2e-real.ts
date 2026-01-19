import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoMocks } from "@/lib/core/guard";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { processToolChat } from "@/lib/ai/tool-chat";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { isCompiledTool, runCompiledTool } from "@/lib/compiler/ToolCompiler";

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
    { name: "Google", prompt: "Show my latest emails" },
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

      if (!result.spec || !isCompiledTool(result.spec)) {
        throw new Error("Compiler failed to produce a compiled tool");
      }

      await supabase
        .from("projects")
        .update({ spec: result.spec as any })
        .eq("id", project.id);

      const registry = new RuntimeActionRegistry(orgId);
      const state = await runCompiledTool({ tool: result.spec, registry });
      console.log("✅ Execution State:", state);
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
