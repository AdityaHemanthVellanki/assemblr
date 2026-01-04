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
  execution_mode: "ephemeral" | "materialize" | "tool"; // NEW: Determines execution path
  intent: "direct_answer" | "persistent_view"; // Legacy, keep for now or map to mode
  
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

CRITICAL PRINCIPLES:
1. **EPHEMERAL FIRST**: Defaults to "ephemeral" mode. You do NOT need a schema, table, or dashboard view to answer questions.
2. **DIRECT EXECUTION**: If an integration is connected, you can plan ANY valid resource request (using "ad_hoc_{resource}").
3. **NO BLOCKING**: Never refuse a request because a schema is missing.

AVAILABLE METRICS:
{{METRICS}}

AVAILABLE CAPABILITIES (Reference only - you may go beyond these if integration is connected):
{{CAPABILITIES}}

AVAILABLE SCHEMAS:
{{SCHEMAS}}

Instructions:
1. Analyze the user's request.
2. Determine the EXECUTION MODE ("execution_mode"):
   - "ephemeral" (DEFAULT): For ANY informational query (e.g., "Show me...", "List...", "Count...", "Who is...").
     -> NO schema creation, NO dashboard updates.
   - "materialize": ONLY if the user EXPLICITLY asks to "save", "track", "add to dashboard", or "create a widget".
     -> Triggers schema discovery and dashboard mutation.
   - "tool": For complex workflows or multi-step joins.

3. Construct the Plan:
   - If the integration is connected, you CAN plan for resources even if not listed in CAPABILITIES.
   - Use standard API resource names (e.g., "user", "repos", "issues", "commits").
   - IMPORTANT: If a capability is not in the registry, you MUST generate a capabilityId in the format "ad_hoc_{resource}".
     Example: If the user wants "commits" and it's not registered, use "ad_hoc_commits".
     Example: If the user wants "users.list", use "ad_hoc_users_list".
   - CRITICAL: For "commits", you MUST require a "repo" parameter (e.g., "owner/repo"). If the user did not specify a repo, do NOT generate a plan. Instead, explain that you need the repository name.
   - CRITICAL: Check "REQUIRED PARAMS" in the Capabilities list. If a param is required but missing, do NOT plan.

4. Set "intent":
   - "direct_answer" if mode is "ephemeral".
   - "persistent_view" if mode is "materialize".

If you cannot form a plan (e.g. missing repo param), return an empty "plans" array and a clear "explanation" asking for clarification.

You MUST respond with valid JSON only. Structure:
{
  "plans": [
    {
      "integrationId": "string",
      "capabilityId": "string", // Use "ad_hoc_{resource}" if not in registry
      "resource": "string",
      "params": { ... },
      "explanation": "string",
      "execution_mode": "ephemeral" | "materialize" | "tool",
      "intent": "direct_answer" | "persistent_view",
      "metricRef": { ... },
      "newMetric": { ... },
      ...
    }
  ],
  "explanation": "string (optional - use this to ask for clarification if no plans generated)",
  "error": "string (optional)"
}
`;

export async function planExecution(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = []
): Promise<{ plans: ExecutionPlan[]; error?: string; explanation?: string }> {
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
