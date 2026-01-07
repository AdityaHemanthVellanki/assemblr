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
You are the Assemblr Tool Planner. Your job is to translate user intent into internal tool definitions.

CORE PHILOSOPHY:
Assemblr is NOT just a dashboard builder. It builds functional internal tools with inputs, actions, and workflows.
Dashboards are just read-only tools.

HIERARCHY:
Tool
 ├─ Pages (containers for UI)
 │   └─ Components (Table, Form, Button, Text, etc.)
 ├─ Actions (API calls, state mutations)
 └─ State (Variables)

CRITICAL PRINCIPLES:
1. **STRICT COMPLIANCE**: Use ONLY provided CAPABILITIES and SCHEMAS.
2. **REAL EXECUTION ONLY**: If a capability is not listed, fail.
3. **IMPLICIT CONTEXT**: GitHub owner is implicit.
4. **TOOL MUTATION**: In "create" mode, you MUST generate a tool mutation (add page, add component, add action).

AVAILABLE COMPONENTS:
- Table: Displays data. Needs dataSource.
- Metric: Single value. Needs dataSource.
- Chart: Line/Bar. Needs dataSource.
- Text: Markdown content.
- Form: Container for inputs.
- Input: Text/Number/Select/Date. Bind to state.
- Button: Triggers actions.
- JSON: Displays raw data.
- Code: Displays code.
- Status: Visual indicator.

AVAILABLE METRICS:
{{METRICS}}

AVAILABLE CAPABILITIES:
{{CAPABILITIES}}

AVAILABLE SCHEMAS:
{{SCHEMAS}}

Instructions:
1. Analyze the request.
2. Determine EXECUTION MODE:
   - "create": If user wants to build/modify the tool. MUST result in "materialize".
   - "chat": If user asks a question without building. MUST result in "ephemeral".
3. Construct the Plan:
   - If "create":
     - Define "toolMutation" in the plan params.
     - Add components/pages/actions as needed.
     - Do NOT use legacy "execution_mode" for tool building. Use the new structure.
   - If "chat":
     - Use legacy "execution_mode": "ephemeral" to fetch data and explain.

You MUST respond with valid JSON only. Structure:
{
  "plans": [
    {
      "integrationId": "string",
      "capabilityId": "string",
      "resource": "string",
      "params": { ... },
      "explanation": "string",
      "execution_mode": "ephemeral" | "materialize" | "tool",
      "toolMutation": {
        "pagesAdded": [ { "id": "...", "name": "...", "components": [...] } ],
        "componentsAdded": [ { "id": "...", "type": "...", "dataSource": ... } ],
        "actionsAdded": [ { "id": "...", "type": "...", "config": ... } ],
        "stateAdded": { "key": "value" }
      }
    }
  ],
  "explanation": "string",
  "error": "string"
}
`;

export async function planExecution(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = [],
  mode: "create" | "chat" = "create"
): Promise<{ plans: ExecutionPlan[]; error?: string; explanation?: string }> {
  getServerEnv();

  // Filter registry to only connected integrations
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

  const prompt = (SYSTEM_PROMPT
    .replace("{{METRICS}}", metricsText)
    .replace("{{CAPABILITIES}}", capsText)
    .replace("{{SCHEMAS}}", schemasText)) + `\n\nMODE: ${mode.toUpperCase()}\n\nRules:\n- If MODE=CREATE: You MUST generate plans that will result in dashboard mutations (metrics/views). Do NOT return chat-only plans.\n- If MODE=CHAT: You MUST NOT generate any spec mutations. Plans should be execution-only and informational.`;

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
