import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { DiscoveredSchema } from "@/lib/schema/types";

// The Plan structure
export type ExecutionPlan = {
  integrationId: string;
  capabilityId: string;
  resource: string;
  params: Record<string, unknown>; // Filters, sort, etc.
  explanation: string;
};

// Error Types
export class AmbiguousIntentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AmbiguousIntentError";
  }
}

export class UnsupportedCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedCapabilityError";
  }
}

const SYSTEM_PROMPT = `
You are the Assemblr Capability Planner. Your job is to map user intent to specific, registered capabilities.

AVAILABLE CAPABILITIES:
{{CAPABILITIES}}

AVAILABLE SCHEMAS:
{{SCHEMAS}}

Instructions:
1. Analyze the user's request.
2. Select the MOST appropriate capability from the list.
3. Extract parameters (filters, sort) that are valid for that capability.
4. If the request is ambiguous (e.g., "show issues" but both GitHub and Linear are connected), ask for clarification by returning an error or explanation.
5. If the request is unsupported, return an empty plan with an explanation.

You MUST respond with valid JSON only. Structure:
{
  "plans": [
    {
      "integrationId": "string",
      "capabilityId": "string",
      "resource": "string",
      "params": { ... },
      "explanation": "string"
    }
  ],
  "error": "string (optional)"
}

Rules:
- "params" keys MUST match "supportedFields" for the capability.
- Do not invent capabilities.
- Do not invent fields.
`;

export async function planExecution(
  userMessage: string,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[]
): Promise<{ plans: ExecutionPlan[]; error?: string }> {
  getServerEnv();

  // Filter registry to only connected integrations
  const availableCapabilities = CAPABILITY_REGISTRY.filter((c) =>
    connectedIntegrationIds.includes(c.integrationId)
  );

  if (availableCapabilities.length === 0) {
    return { plans: [], error: "No integrations connected." };
  }

  const capsText = availableCapabilities
    .map(
      (c) =>
        `- ID: ${c.id}\n  Integration: ${c.integrationId}\n  Resource: ${c.resource}\n  Fields: ${c.supportedFields.join(", ")}`
    )
    .join("\n\n");

  const schemasText = schemas
    .map(
      (s) =>
        `- Integration: ${s.integrationId}\n  Resource: ${s.resource}\n  Fields: ${s.fields.map((f) => f.name).join(", ")}`
    )
    .join("\n\n");

  const prompt = SYSTEM_PROMPT.replace("{{CAPABILITIES}}", capsText).replace(
    "{{SCHEMAS}}",
    schemasText
  );

  try {
    const response = (await azureOpenAIClient.chat.completions.create({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    } as unknown as Parameters<typeof azureOpenAIClient.chat.completions.create>[0])) as unknown as {
      choices: Array<{ message?: { content?: string | null } | null }>;
    };

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const result = JSON.parse(content);
    return result;
  } catch (err) {
    console.error("Planning failed", err);
    throw new Error("Failed to generate execution plan");
  }
}
