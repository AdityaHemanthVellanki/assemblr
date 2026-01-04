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
  intent: "direct_answer" | "persistent_view"; // New field
  
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

  // Phase 8: New Workflow Definition
  // If the planner decided to create a new workflow, it populates this.
  newWorkflow?: {
    name: string;
    triggerConfig: {
      type: "alert" | "schedule";
      refId?: "alert_from_newAlert" | string; // alert_id or reference
      cron?: string;
    };
    actions: Array<{ type: "slack" | "email" | "github_issue"; config: any }>;
  };

  // Phase 12: New Join Definition
  newJoin?: {
    name: string;
    leftIntegrationId: string;
    leftResource: string;
    leftField: string;
    rightIntegrationId: string;
    rightResource: string;
    rightField: string;
    joinType: "inner" | "left" | "right";
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
You are the Assemblr Capability Planner. Your job is to map user intent to specific execution plans.
You are NOT limited to existing schemas. If an integration is connected, you can plan ANY valid resource request.

AVAILABLE METRICS:
{{METRICS}}

AVAILABLE CAPABILITIES (Reference only - you may go beyond these if integration is connected):
{{CAPABILITIES}}

AVAILABLE SCHEMAS:
{{SCHEMAS}}

Instructions:
1. Analyze the user's request.
2. Determine the INTENT:
   - "direct_answer": One-off question (e.g., "Who am I?", "List my repos"). No dashboard needed.
   - "persistent_view": Reusable data (e.g., "Track open issues", "Show latest commit"). Needs a view/metric.
3. FIRST, check if an existing metric matches the intent.
   - If yes, use it by filling "metricRef".
4. If no metric matches, construct a plan.
   - If the integration is connected, you CAN plan for resources even if not listed in CAPABILITIES.
   - Use standard API resource names (e.g., "user", "repos", "issues", "commits").
   - IMPORTANT: If a capability is not in the registry, you MUST generate a capabilityId in the format "ad_hoc_{resource}".
     Example: If the user wants "commits" and it's not registered, use "ad_hoc_commits".
     Example: If the user wants "users.list", use "ad_hoc_users_list".
   - CRITICAL: For "commits", you MUST require a "repo" parameter (e.g., "owner/repo"). If the user did not specify a repo, do NOT generate a plan. Instead, explain that you need the repository name.
   - CRITICAL: Check "REQUIRED PARAMS" in the Capabilities list. If a param is required but missing, do NOT plan.
5. If the request implies a reusable KPI, set intent="persistent_view" and suggest "newMetric".
6. If the request is a simple lookup, set intent="direct_answer".

You MUST respond with valid JSON only. Structure:
{
  "plans": [
    {
      "integrationId": "string",
      "capabilityId": "string", // Use "ad_hoc_{resource}" if not in registry
      "resource": "string",
      "params": { ... },
      "explanation": "string",
      "intent": "direct_answer" | "persistent_view",
      "metricRef": { ... },
      "newMetric": { ... },
      ...
    }
  ],
  "error": "string (optional)"
}
`;

export async function planExecution(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = []
): Promise<{ plans: ExecutionPlan[]; error?: string }> {
  getServerEnv();

  // Filter registry to only connected integrations
  // We NO LONGER limit to registry capabilities. We allow ad-hoc.
  // But we still pass the registry for reference.
  const connectedCapabilities = CAPABILITY_REGISTRY.filter((c) =>
    connectedIntegrationIds.includes(c.integrationId)
  );

  if (connectedIntegrationIds.length === 0) {
    return { plans: [], error: "No integrations connected." };
  }

  const metricsText = availableMetrics.length > 0
    ? availableMetrics.map(m => `- Name: ${m.name} (ID: ${m.id})\n  Desc: ${m.description || "None"}`).join("\n")
    : "None";

  const capsText = connectedCapabilities
    .map(
      (c) =>
        `- ID: ${c.id}\n  Integration: ${c.integrationId}\n  Resource: ${c.resource}\n  Fields: ${c.supportedFields.join(", ")}${c.constraints?.requiredFilters ? `\n  REQUIRED PARAMS: ${c.constraints.requiredFilters.join(", ")}` : ""}`
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
    // Convert history to OpenAI format, limiting context if needed
    const contextMessages = history.map(m => ({
      role: m.role,
      content: m.content
    })).slice(-10); // Last 10 messages for context

    const response = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        { role: "system", content: prompt },
        ...contextMessages,
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const result = JSON.parse(content);
    return result;
  } catch (err) {
    console.error("Planning failed", err);
    throw new Error("Failed to generate execution plan");
  }
}
