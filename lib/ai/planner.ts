import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { DiscoveredSchema } from "@/lib/schema/types";
import { Metric } from "@/lib/metrics/store";

// The Plan structure
export type ExecutionPlan = {
  integrationId: string;
  capabilityId: string;
  resource: string;
  params: Record<string, unknown>; // Filters, sort, etc.
  explanation: string;
  
  // Phase 5: Reused Metric Reference
  // If the planner decided to use an existing metric, it populates this.
  metricRef?: {
    id: string;
    version: number;
  };
  
  // Phase 5: New Metric Definition
  // If the planner decided to create a new metric, it populates this.
  newMetric?: {
    name: string;
    description: string;
    definition: any; // MetricDefinition
  };

  // Phase 7: New Alert Definition
  // If the planner decided to create a new alert, it populates this.
  newAlert?: {
    metricId: string; // "new" if creating a metric simultaneously, or existing ID
    conditionType: "threshold" | "change";
    comparisonOp: "gt" | "lt" | "eq" | "gte" | "lte";
    thresholdValue: number;
    actionConfig: { type: "email" | "slack"; target: string };
  };
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
You are the Assemblr Capability Planner. Your job is to map user intent to specific, registered capabilities OR reuse existing metrics.

AVAILABLE METRICS:
{{METRICS}}

AVAILABLE CAPABILITIES:
{{CAPABILITIES}}

AVAILABLE SCHEMAS:
{{SCHEMAS}}

Instructions:
1. Analyze the user's request.
2. FIRST, check if an existing metric matches the intent.
   - If yes, use it by filling "metricRef".
   - Do NOT create a new plan if a metric exists.
3. If no metric matches, select the MOST appropriate capability from the list.
4. Extract parameters (filters, sort) that are valid for that capability.
5. If the request implies a reusable KPI (e.g. "active users", "open issues count"), suggest creating a NEW metric by filling "newMetric".
6. If the request implies monitoring or alerting (e.g. "notify me when", "alert if > 10"), suggest creating a NEW alert by filling "newAlert".
   - If it refers to a new metric, set metricId="new".
   - If it refers to an existing metric (from AVAILABLE METRICS), set metricId to the ID.
7. If the request is ambiguous (e.g., "show issues" but both GitHub and Linear are connected), ask for clarification by returning an error or explanation.
8. If the request is unsupported, return an empty plan with an explanation.

You MUST respond with valid JSON only. Structure:
{
  "plans": [
    {
      "integrationId": "string",
      "capabilityId": "string",
      "resource": "string",
      "params": { ... },
      "explanation": "string",
      "metricRef": { "id": "string", "version": 1 }, // Optional, if reusing
      "newMetric": { "name": "string", "description": "string", "definition": { ... } }, // Optional, if creating
      "newAlert": { "metricId": "string", "conditionType": "threshold", "comparisonOp": "gt", "thresholdValue": 10, "actionConfig": { ... } } // Optional, if alerting
    }
  ],
  "error": "string (optional)"
}

Rules:
- "params" keys MUST match "supportedFields" for the capability.
- Do not invent capabilities.
- Do not invent fields.
- Prefer reuse -> extend -> create new.
`;

export async function planExecution(
  userMessage: string,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = []
): Promise<{ plans: ExecutionPlan[]; error?: string }> {
  getServerEnv();

  // Filter registry to only connected integrations
  const availableCapabilities = CAPABILITY_REGISTRY.filter((c) =>
    connectedIntegrationIds.includes(c.integrationId)
  );

  if (availableCapabilities.length === 0) {
    return { plans: [], error: "No integrations connected." };
  }

  const metricsText = availableMetrics.length > 0
    ? availableMetrics.map(m => `- Name: ${m.name} (ID: ${m.id})\n  Desc: ${m.description || "None"}`).join("\n")
    : "None";

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

  const prompt = SYSTEM_PROMPT
    .replace("{{METRICS}}", metricsText)
    .replace("{{CAPABILITIES}}", capsText)
    .replace("{{SCHEMAS}}", schemasText);

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
