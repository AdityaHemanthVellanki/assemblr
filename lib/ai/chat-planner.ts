import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { INTEGRATIONS, type Capability } from "@/lib/integrations/capabilities";

// Extract valid integration IDs for the prompt
const VALID_INTEGRATION_IDS = INTEGRATIONS.map((i) => i.id).join(", ");

const plannerSchema = z.object({
  intent: z.enum(["tool_modification", "question", "integration_request"]),
  required_capabilities: z.array(z.string()), // We validate against Capability enum in logic
  requested_integration_ids: z.array(z.string()),
  ambiguity_questions: z.array(z.string()).optional(),
});

export type ChatPlan = z.infer<typeof plannerSchema>;

const SYSTEM_PROMPT = `
You are the Assemblr Chat Planner. Your job is to analyze user messages and extract intent, capabilities, and specific integration requests.

You have access to the following valid Integration IDs:
${VALID_INTEGRATION_IDS}

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
   - If the user mentions a vendor NOT in the list, ignore it or flag it in ambiguity.

Output JSON only.
`;

export async function planChatResponse(userMessage: string): Promise<ChatPlan> {
  getServerEnv();

  try {
    const response = await azureOpenAIClient.chat.completions.create({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const json = JSON.parse(content);
    return plannerSchema.parse(json);
  } catch (err) {
    console.error("Chat planner failed", err);
    // Fallback to a safe default
    return {
      intent: "question",
      required_capabilities: [],
      requested_integration_ids: [],
    };
  }
}
