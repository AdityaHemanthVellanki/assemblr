import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { INTEGRATIONS } from "@/lib/integrations/capabilities";

const plannerSchema = z
  .object({
    intent: z.string(),
    required_capabilities: z.array(z.string()),
    requested_integration_ids: z.array(z.string()),
  })
  .strict();

export type ChatPlan = z.infer<typeof plannerSchema>;

const SYSTEM_PROMPT = `
You are the Assemblr Chat Planner. Your job is to analyze user messages and extract intent, capabilities, and specific integration requests.

We ONLY support the following 5 integrations (Phase 1):
1. GitHub (id: "github")
2. Slack (id: "slack")
3. Notion (id: "notion")
4. Linear (id: "linear")
5. Google (id: "google") - covers Sheets, Docs, Gmail, Meet

Any other integration (e.g. Stripe, HubSpot, Salesforce, OpenAI, AWS) is OUT OF SCOPE. Do not request them.

You MUST return valid JSON.
You MUST include ALL of the following fields:
- intent (string)
- required_capabilities (array, even if empty)
- requested_integration_ids (array, even if empty)

If no capabilities are required, return an empty array.
If no integrations are requested, return an empty array.

DO NOT omit fields.
DO NOT return undefined.
DO NOT return null.
DO NOT explain anything.
DO NOT output text outside JSON.

Hard Rules:
1. Intent Classification:
   - "tool_modification": User wants to build/change the dashboard (add charts, show data, etc).
   - "question": User is asking a question about the current tool or data.
   - "integration_request": User explicitly wants to connect a new tool.

2. Capability Extraction:
   - Extract generic capabilities needed (e.g., "payment_transactions", "issues", "messaging").
   - Do NOT guess capabilities if the user just asks a question.

3. Integration Extraction:
   - If the user mentions a supported vendor (Stripe, GitHub, Slack, Notion, Linear, Google), extract the matching ID.
   - If the user mentions "Google Sheets", "Gmail", etc., map it to "google".
   - If the user mentions a vendor NOT in the list, do not include it.

Output JSON only.
`;

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

    const response = (await azureOpenAIClient.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
    } as unknown as Parameters<typeof azureOpenAIClient.chat.completions.create>[0])) as unknown as {
      choices: Array<{ message?: { content?: string | null } | null }>;
    };

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const json = JSON.parse(content);
    return parseChatPlan(json);
  } catch (err) {
    console.error("Chat planner failed", err);
    throw err;
  }
}
