import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { INTEGRATIONS } from "@/lib/integrations/capabilities";

// Extract valid integration IDs for the prompt
const VALID_INTEGRATION_IDS = INTEGRATIONS.map((i) => i.id).join(", ");

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

You have access to the following valid Integration IDs:
${VALID_INTEGRATION_IDS}

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
   - Extract generic capabilities needed (e.g., "payment_transactions", "crm_leads").
   - Do NOT guess capabilities if the user just asks a question.

3. Integration Extraction:
   - If the user mentions a specific vendor (e.g., "Show me Stripe data", "Connect HubSpot"), extract the matching ID from the valid list.
   - If the user mentions a vendor NOT in the list, do not include it in requested_integration_ids.

Output JSON only.
`;

export function parseChatPlan(value: unknown): ChatPlan {
  return plannerSchema.parse(value);
}

export async function planChatResponse(userMessage: string): Promise<ChatPlan> {
  getServerEnv();

  try {
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
