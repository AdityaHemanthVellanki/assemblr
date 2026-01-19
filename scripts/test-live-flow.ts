import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { processToolChat } from "@/lib/ai/tool-chat";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { isCompiledTool, runCompiledTool } from "@/lib/compiler/ToolCompiler";

async function runLiveFlowTest() {
  getServerEnv();
  const session = await bootstrapRealUserSession();
  const { user, orgId } = session;
  const supabase = createSupabaseAdminClient();

  const prompt = "Show my latest emails";

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({ org_id: orgId, name: "Live Flow Test", spec: {} as any })
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
    userMessage: prompt,
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
  console.log(`✅ Live flow test passed for ${user.email}`);
}

runLiveFlowTest().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
