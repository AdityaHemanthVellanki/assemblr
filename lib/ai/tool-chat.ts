import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { dashboardSpecSchema, type DashboardSpec } from "@/lib/spec/dashboardSpec";

// Re-use the core schema definition text, but adapted for the chat wrapper
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
});

export type ToolChatResponse = z.infer<typeof chatResponseSchema>;

export async function processToolChat(input: {
  currentSpec: DashboardSpec | null;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
}): Promise<ToolChatResponse> {
  getServerEnv();

  // Construct the conversation
  const systemMessage = {
    role: "system" as const,
    content: SYSTEM_PROMPT + `\n\nCurrent Spec: ${JSON.stringify(input.currentSpec ?? { title: "New Tool", metrics: [], views: [] })}`,
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
      console.error("AI returned invalid JSON", content, err);
      throw new Error("Failed to parse AI response");
    }
  } catch (err) {
    console.error("Azure OpenAI error", err);
    throw new Error("AI service unavailable");
  }
}
