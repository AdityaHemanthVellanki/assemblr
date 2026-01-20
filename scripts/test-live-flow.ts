import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { processToolChat } from "@/lib/ai/tool-chat";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";

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

  if (!result.spec || !isToolSystemSpec(result.spec)) {
    throw new Error("Compiler failed to produce a tool system");
  }

  await supabase
    .from("projects")
    .update({ spec: result.spec as any })
    .eq("id", project.id);

  const action = result.spec.actions[0];
  const compiledTool = buildCompiledToolArtifact(result.spec);
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
    console.log("✅ Execution View:", projection);
  } else {
    console.log("✅ Execution State:", exec.state);
  }
  console.log(`✅ Live flow test passed for ${user.email}`);
}

runLiveFlowTest().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
