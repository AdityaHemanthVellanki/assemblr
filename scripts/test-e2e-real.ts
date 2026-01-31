import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoMocks } from "@/lib/core/guard";
import { bootstrapRealUserSession } from "./auth-bootstrap";
import { processToolChat } from "@/lib/ai/tool-chat";
import { IntegrationId, isToolSystemSpec } from "@/lib/toolos/spec";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";
import { ensureToolIdentity, canExecuteTool } from "@/lib/toolos/lifecycle";
import { computeSpecHash } from "@/lib/spec/toolSpec";

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
      name: "Reply Required Emails",
      prompt: "Show me emails I need to reply to but haven’t",
    },
    {
      name: "Response Priority",
      prompt: "What should I respond to first right now?",
    },
    {
      name: "Commitments Follow Up",
      prompt: "What commitments did I make but never followed up on?",
    },
  ];

  const supabase = createSupabaseAdminClient();

  for (const scenario of scenarios) {
    console.log(`\n--- Scenario: ${scenario.name} ---`);
    try {
      const { toolId } = await ensureToolIdentity({
        supabase,
        orgId,
        userId: user.id,
        name: `E2E ${scenario.name}`,
        purpose: scenario.prompt,
        sourcePrompt: scenario.prompt,
      });

      const result = await processToolChat({
        orgId,
        toolId,
        userId: user.id,
        currentSpec: {},
        messages: [],
        userMessage: scenario.prompt,
        connectedIntegrationIds: [],
        mode: "create",
        integrationMode: "auto",
        supabaseClient: supabase,
      });

      if (!result.spec || !isToolSystemSpec(result.spec)) {
        throw new Error("Compiler failed to produce a tool system");
      }

      await supabase
        .from("projects")
        .update({ spec: result.spec as any })
        .eq("id", toolId);

      const { data: projectRow } = await supabase
        .from("projects")
        .select("active_version_id")
        .eq("id", toolId)
        .single();
      if (!projectRow?.active_version_id) {
        throw new Error("Missing active_version_id after compile");
      }
      const { data: versionRow } = await (supabase.from("tool_versions") as any)
        .select("tool_spec, compiled_tool, build_hash")
        .eq("id", projectRow.active_version_id)
        .single();
      if (!versionRow?.tool_spec || !versionRow?.compiled_tool) {
        throw new Error("Missing tool_spec or compiled_tool after compile");
      }
      const computedHash = computeSpecHash(versionRow.tool_spec);
      const compiledHash = versionRow.compiled_tool?.specHash;
      if (compiledHash !== computedHash) {
        console.log("Hash mismatch", {
          compiledHash,
          computedHash,
          buildHash: versionRow.build_hash,
        });
      }

      const executionCheck = await canExecuteTool({ toolId });
      if (!executionCheck.ok) {
        throw new Error(`Tool not executable after compile (${executionCheck.reason})`);
      }

      const integrations = result.spec.integrations.map((s) => s.id) as IntegrationId[];
      const compiledTool = buildCompiledToolArtifact(result.spec);
      for (const integration of integrations) {
        const action = result.spec.actions.find((a) => a.integrationId === integration);
        if (!action) {
          console.error(`❌ Missing action for ${integration}`);
          continue;
        }
        try {
          const exec = await executeToolAction({
            orgId,
            toolId,
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
