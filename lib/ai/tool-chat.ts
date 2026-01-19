import "server-only";

import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { compileTool } from "@/lib/compiler/ToolCompiler";
import { Intent } from "@/lib/intent/IntentSchema";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";

export interface ToolChatRequest {
  orgId: string;
  toolId: string;
  currentSpec?: unknown;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
  mode: "create" | "modify" | "chat";
  integrationMode?: "auto" | "manual";
  selectedIntegrationIds?: string[];
}

export interface ToolChatResponse {
  explanation: string;
  message: { type: "text"; content: string };
  spec?: unknown;
  metadata?: Record<string, any>;
}

const intentSchema = z
  .object({
    goal: z.string(),
    integration: z.object({
      provider: z.enum(["google", "slack", "github", "linear", "notion"]),
      capability: z.string(),
    }),
    parameters: z.record(z.string(), z.any()).optional(),
    presentation: z.object({
      type: z.enum(["table", "list", "card", "text"]),
      fields: z.array(z.string()).optional(),
    }),
    refresh: z.object({ mode: z.enum(["onLoad", "manual"]) }).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed = getCapabilitiesForIntegration(value.integration.provider).map(
      (c) => c.id,
    );
    if (!allowed.includes(value.integration.capability)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid capability '${value.integration.capability}' for provider '${value.integration.provider}'`,
      });
    }
  });

const capabilityCatalog = ["google", "slack", "github", "linear", "notion"]
  .map((provider) => {
    const ids = getCapabilitiesForIntegration(provider).map((c) => c.id);
    return `${provider}: ${ids.join(", ")}`;
  })
  .join("\n");

const INTENT_SYSTEM_PROMPT = `
You are an Intent compiler. You must output a single JSON object that matches this schema:
{
  "goal": string,
  "integration": { "provider": "google" | "slack" | "github" | "linear" | "notion", "capability": string },
  "parameters": object (optional),
  "presentation": { "type": "table" | "list" | "card" | "text", "fields": string[] (optional) },
  "refresh": { "mode": "onLoad" | "manual" } (optional)
}
Do not include any additional keys. Output JSON only.
Valid capabilities by provider:
${capabilityCatalog}
`;

export async function processToolChat(
  input: ToolChatRequest,
): Promise<ToolChatResponse> {
  getServerEnv();

  if (input.mode !== "create") {
    throw new Error("Only create mode is supported in compiler pipeline");
  }

  const json = await generateIntent(input.userMessage);

  const compiled = compileTool({
    intent: json as Intent,
    orgId: input.orgId,
    toolId: input.toolId,
    name: json.goal,
    description: json.goal,
  });

  return {
    explanation: json.goal,
    message: { type: "text", content: json.goal },
    spec: compiled,
    metadata: { persist: true },
  };
}

async function generateIntent(prompt: string): Promise<Intent> {
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  const first = parseIntent(content);
  if (first.ok) return first.value;

  const retry = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Your last response was invalid: ${first.error}. Return ONLY valid JSON for the same request: ${prompt}`,
      },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });

  const retryContent = retry.choices[0]?.message?.content;
  const second = parseIntent(retryContent);
  if (!second.ok) {
    throw new Error("AI returned invalid JSON");
  }
  return second.value;
}

function parseIntent(
  content: string | null | undefined,
): { ok: true; value: Intent } | { ok: false; error: string } {
  if (!content || typeof content !== "string") {
    return { ok: false, error: "empty response" };
  }
  if (!content.trim().startsWith("{")) {
    return { ok: false, error: "non-JSON response" };
  }
  try {
    const parsed = JSON.parse(content);
    const validated = intentSchema.parse(parsed) as Intent;
    return { ok: true, value: validated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid JSON";
    return { ok: false, error: msg };
  }
}
