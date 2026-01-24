import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processToolChat } from "@/lib/ai/tool-chat";
import { bootstrapRealUserSession } from "./auth-bootstrap";

type Scenario = {
  name: string;
  prompt: string;
};

const scenarios: Scenario[] = [
  {
    name: "complex_failure_correlation",
    prompt:
      "show mails about contexto wherever build failed and show that particular commit on github wherever it failed",
  },
  {
    name: "notion_todos",
    prompt: "show my assemblr to-dos from notion",
  },
  {
    name: "ambiguous_prompt",
    prompt: "show commits or emails about failures",
  },
  {
    name: "simple_email_prompt",
    prompt: "show mails about contexto",
  },
];

async function runScenario(admin: ReturnType<typeof createSupabaseAdminClient>, orgId: string, userId: string, scenario: Scenario) {
  const { data: toolRow, error: toolError } = await (admin.from("projects") as any)
    .insert({
      org_id: orgId,
      name: `E2E Tool ${scenario.name}`,
      status: "BUILDING",
      spec: {},
    })
    .select("id")
    .single();

  if (toolError || !toolRow?.id) {
    throw new Error(`Failed to create tool row: ${toolError?.message ?? "unknown error"}`);
  }

  const toolId = toolRow.id as string;
  const response = await processToolChat({
    orgId,
    toolId,
    userId,
    messages: [],
    userMessage: scenario.prompt,
    connectedIntegrationIds: ["google", "github"],
    mode: "create",
  });

  const { data: renderState } = await (admin.from("tool_render_state") as any)
    .select("view_spec, data_ready, view_ready")
    .eq("tool_id", toolId)
    .maybeSingle();

  if (!renderState?.view_spec) {
    throw new Error(`[${scenario.name}] Missing view_spec after finalize`);
  }
  const viewSpec = renderState.view_spec;
  if (!viewSpec.goal_validation || !viewSpec.decision) {
    throw new Error(`[${scenario.name}] Missing goal validation or decision`);
  }
  if (viewSpec.decision.kind !== "ask" && (!viewSpec.intent_contract || !viewSpec.semantic_plan)) {
    throw new Error(`[${scenario.name}] Missing intent contract or semantic plan`);
  }
  const level = viewSpec.goal_validation.level;
  const decision = viewSpec.decision;
  if (viewSpec.goal_validation.confidence < 0.8 && decision.kind === "render") {
    throw new Error(`[${scenario.name}] Low confidence should not render`);
  }
  if (level === "satisfied" && decision.kind !== "render") {
    throw new Error(`[${scenario.name}] Satisfied goal must render`);
  }
  if (level === "partial" && (decision.kind !== "render" || !decision.partial)) {
    throw new Error(`[${scenario.name}] Partial goal must render with partial flag`);
  }
  if (level === "unsatisfied" && decision.kind === "render") {
    throw new Error(`[${scenario.name}] Unsatisfied goal must not render`);
  }
  if (viewSpec.goal_validation.absence_reason === "ambiguous_query" && decision.kind !== "ask") {
    throw new Error(`[${scenario.name}] Ambiguous query must ask clarification`);
  }
  const expectedDataReady = level === "satisfied";
  if (renderState.data_ready !== expectedDataReady || renderState.view_ready !== true) {
    throw new Error(`[${scenario.name}] Flags inconsistent with goal validation`);
  }

  console.log("Scenario result", {
    name: scenario.name,
    toolId,
    decision,
    goal_validation: viewSpec.goal_validation,
    status: response.metadata?.status ?? null,
  });
}

async function runE2E() {
  const admin = createSupabaseAdminClient();
  const session = await bootstrapRealUserSession();
  const orgId = session.orgId;
  const userId = session.user.id;

  for (const scenario of scenarios) {
    await runScenario(admin, orgId, userId, scenario);
  }
}

runE2E().catch((error) => {
  console.error("Semantic goal E2E verification failed:", error);
  process.exit(1);
});
