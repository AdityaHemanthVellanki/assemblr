import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { INTEGRATIONS } from "@/lib/integrations/capabilities";
import { CHAT_PLANNER_PROMPT } from "@/lib/ai/prompts";

const plannerSchema = z
  .object({
    intent: z.string(),
    required_capabilities: z.array(z.string()),
    requested_integration_ids: z.array(z.string()),
  })
  .strict();

export type ChatPlan = z.infer<typeof plannerSchema>;

export function parseChatPlan(value: unknown): ChatPlan {
  return plannerSchema.parse(value);
}

function detectIntegrationRequestFromText(userMessage: string): string[] {
  const text = userMessage.toLowerCase();
  const triggers = [
    "connect",
    "integrate",
    "integration",
    "link",
    "sync",
    "import",
    "pull data",
    "use ",
    "set up",
    "setup",
    "hook up",
    "authorize",
    "oauth",
  ];
  const hasTrigger = triggers.some((t) => text.includes(t));
  if (!hasTrigger) return [];

  const hits: string[] = [];
  for (const i of INTEGRATIONS) {
    const id = i.id.toLowerCase();
    const name = i.name.toLowerCase();
    const idVariant = id.replaceAll("_", " ");
    
    // Special handling for Google sub-products
    if (id === "google") {
      if (
        text.includes("google") ||
        text.includes("gmail") ||
        text.includes("sheets") ||
        text.includes("docs") ||
        text.includes("meet")
      ) {
        hits.push("google");
        continue;
      }
    }

    if (text.includes(name) || text.includes(id) || text.includes(idVariant)) {
      hits.push(i.id);
    }
  }
  return Array.from(new Set(hits));
}

export async function planChatResponse(userMessage: string): Promise<ChatPlan> {
  getServerEnv();

  try {
    const detected = detectIntegrationRequestFromText(userMessage);
    if (detected.length > 0) {
      return { intent: "integration_request", required_capabilities: [], requested_integration_ids: detected };
    }

    const response = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        { role: "system", content: CHAT_PLANNER_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    // Strict JSON validation
    if (!content.trim().startsWith("{")) {
       console.error("AI returned non-JSON response (parsed)", { content });
       throw new Error("AI returned non-JSON response");
    }

    try {
      const json = JSON.parse(content);
      return parseChatPlan(json);
    } catch (err) {
      console.error("AI returned invalid response", { content, err });
      throw new Error("AI returned invalid JSON");
    }
  } catch (err) {
    console.error("Chat planner failed", err);
    throw err;
  }
}
