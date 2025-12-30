import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { dashboardSpecSchema, type DashboardSpec } from "@/lib/spec/dashboardSpec";
import { planChatResponse } from "./chat-planner";
import { resolveIntegrations } from "@/lib/integrations/resolveIntegrations";
import { INTEGRATIONS, type Capability } from "@/lib/integrations/capabilities";
import { getIntegrationUIConfig } from "@/lib/integrations/registry";
import type { Json } from "@/lib/supabase/database.types";

// --- Schema Definitions ---

const CORE_SPEC_INSTRUCTIONS = `
The "spec" object must strictly follow this schema:
{
  "title": string,
  "description"?: string,
  "metrics": Array<{
    "id": string,
    "label": string,
    "type": "count" | "sum",
    "table": string,
    "field"?: string,
    "groupBy"?: "day"
  }>,
  "views": Array<{
    "id": string,
    "type": "metric" | "line_chart" | "bar_chart" | "table",
    "metricId"?: string,
    "table"?: string
  }>
}

Metric rules:
- count: counts rows. No field.
- sum: sums field. Field required.
- groupBy: "day" or omitted.

View rules:
- metric, line_chart, bar_chart: require metricId.
- table: requires table. No metricId.
- Every metric.id and view.id must be unique.
- Non-table views must reference existing metricIds.
`;

const SYSTEM_PROMPT = `
You are Assemblr AI, an expert product engineer building internal tools.
Your goal is to help the user build and modify a dashboard tool.

If the user asks to connect an integration, do not explain how. The system will show connection controls.

You will receive:
1. The current tool specification (if any).
2. A history of the conversation.
3. The user's latest message.

You must output a JSON object with the following structure:
{
  "explanation": string,
  "spec": object
}

"explanation": A brief, helpful message to the user describing the changes you made, or answering their question.
"spec": The FULL, valid, updated dashboard specification. If no changes are needed, return the current spec exactly.

${CORE_SPEC_INSTRUCTIONS}

Conventions:
- Use readable titles and labels.
- Assume tables exist (users, orders, etc.).
- Prefer simple, effective dashboards.
`;

const chatResponseSchema = z.object({
  explanation: z.string(),
  spec: dashboardSpecSchema,
  metadata: z.object({
    missing_integration_id: z.string().optional(),
    action: z.enum(["connect_integration"]).optional(),
  }).optional(),
});

type LlmToolChatResponse = z.infer<typeof chatResponseSchema>;

export type IntegrationCTA = {
  id: string;
  name: string;
  logoUrl?: string;
  connected: boolean;
  label: string;
  action: string;
};

export type ToolChatMessage =
  | { type: "text"; content: string }
  | { type: "integration_action"; integrations: IntegrationCTA[] };

export type ToolChatResponse = {
  explanation: string;
  message: ToolChatMessage;
  spec: DashboardSpec;
  metadata?: Json | null;
};

// --- Helper: Spec Generation ---

async function generateSpecUpdate(input: {
  currentSpec: DashboardSpec;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): Promise<LlmToolChatResponse> {
  const systemMessage = {
    role: "system" as const,
    content: SYSTEM_PROMPT + `\n\nCurrent Spec: ${JSON.stringify(input.currentSpec)}`,
  };

  const history = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const lastMessage = {
    role: "user" as const,
    content: input.userMessage,
  };

  try {
    const response = (await azureOpenAIClient.chat.completions.create({
      messages: [systemMessage, ...history, lastMessage],
      temperature: 0.2,
      max_tokens: 1200,
    } as unknown as Parameters<typeof azureOpenAIClient.chat.completions.create>[0])) as unknown as {
      choices: Array<{ message?: { content?: string | null } | null }>;
    };

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty content");

    try {
      const json = JSON.parse(content);
      return chatResponseSchema.parse(json);
    } catch (err) {
      console.error("AI returned invalid response", { content, err });
      throw err;
    }
  } catch (err) {
    console.error("Azure OpenAI error", err);
    throw err;
  }
}

// --- Main Orchestrator ---

export async function processToolChat(input: {
  currentSpec: DashboardSpec;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
}): Promise<ToolChatResponse> {
  getServerEnv();

  // 1. Plan and Extract Intent
  const plan = await planChatResponse(input.userMessage);
  console.log("[Chat Orchestrator] Plan:", plan);

  function buildCtas(integrationIds: string[]) {
    const uniq = Array.from(new Set(integrationIds));
    return uniq.map((id) => {
      let name = INTEGRATIONS.find((i) => i.id === id)?.name ?? id;
      let logoUrl: string | undefined;
      try {
        const ui = getIntegrationUIConfig(id);
        name = ui.name;
        logoUrl = ui.logoUrl;
      } catch {}
      const connected = input.connectedIntegrationIds.includes(id);
      const label = connected ? `Reconnect ${name}` : `Connect ${name}`;
      const params = new URLSearchParams();
      params.set("provider", id);
      params.set("source", "chat");
      const action = `/api/oauth/start?${params.toString()}`;
      return { id, name, logoUrl, connected, label, action } satisfies IntegrationCTA;
    });
  }

  if (plan.intent === "integration_request" && plan.requested_integration_ids.length > 0) {
    const integrations = buildCtas(plan.requested_integration_ids);
    return {
      explanation: "",
      message: { type: "integration_action", integrations },
      spec: input.currentSpec,
      metadata: { type: "integration_action", integrations },
    };
  }

  const missingRequested = plan.requested_integration_ids.filter(
    (id) => !input.connectedIntegrationIds.includes(id),
  );
  if (missingRequested.length > 0) {
    const integrations = buildCtas(missingRequested);
    return {
      explanation: "",
      message: { type: "integration_action", integrations },
      spec: input.currentSpec,
      metadata: { type: "integration_action", integrations },
    };
  }

  // 3. Check Capabilities (if no specific integration requested)
  if (plan.requested_integration_ids.length === 0 && plan.required_capabilities.length > 0) {
    // Check if we have coverage
    const resolution = resolveIntegrations({
      capabilities: plan.required_capabilities as Capability[],
      connectedIntegrations: input.connectedIntegrationIds,
    });

    if (resolution.missingCapabilities.length > 0) {
      // We are missing capabilities. We need to suggest an integration.
      // Simple heuristic: Find the highest priority integration that covers the first missing capability.
      const missingCap = resolution.missingCapabilities[0];
      const candidate = INTEGRATIONS
        .filter(i => i.capabilities.includes(missingCap))
        .sort((a, b) => b.priority - a.priority)[0];
      
      if (candidate) {
        const integrations = buildCtas([candidate.id]);
        return {
          explanation: "",
          message: { type: "integration_action", integrations },
          spec: input.currentSpec,
          metadata: { type: "integration_action", integrations },
        };
      }
      
      // If no candidate found (rare), generic error
      return {
        explanation: `I need a data source that supports ${missingCap.replace("_", " ")}.`,
        message: { type: "text", content: `I need a data source that supports ${missingCap.replace("_", " ") }.`, },
        spec: input.currentSpec,
      };
    }
  }

  // 4. Proceed to Spec Generation
  const llm = await generateSpecUpdate({
    currentSpec: input.currentSpec,
    messages: input.messages,
    userMessage: input.userMessage,
  });
  return {
    explanation: llm.explanation,
    message: { type: "text", content: llm.explanation },
    spec: llm.spec,
    metadata: llm.metadata ?? null,
  };
}
