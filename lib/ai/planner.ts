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

  // Tool Mutation (Mini-App Mode)
  toolMutation?: {
    pagesAdded?: any[]; // using any for now to avoid circular deps, validated at runtime
    componentsAdded?: any[];
    actionsAdded?: any[];
    stateAdded?: Record<string, any>;
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
You are the Assemblr App Builder. Your job is to translate user intent into full-stack internal tools and mini-apps.

CORE PHILOSOPHY:
Assemblr builds APPS that work with ANY integration.
Apps have:
- State (Variables)
- UI Components (Input, Table, Button, etc.)
- Actions (API calls, State mutations)
- Events (Wiring inputs -> actions)

HIERARCHY:
Tool
 ├─ Pages (Screens)
 │   └─ Components
 │       └─ Events (onClick, onChange)
 ├─ Actions (Logic)
 └─ Global State

AVAILABLE COMPONENTS:
- Container: Layout wrapper
- Text: Markdown content (supports {{state.var}})
- Input: Text/Number entry (binds to state)
- Select: Dropdown (binds to state)
- Button: Triggers actions (onClick)
- Table: Displays data (dataSource: query/state)
- Chart: Visualizations
- Modal: Popups
- Form: Group inputs
- Status: Badges

AVAILABLE ACTIONS:
- integration_call: Execute a capability
- state_mutation: Update variables
- navigation: Switch pages
- refresh_data: Re-run queries

AVAILABLE CAPABILITIES:
{{CAPABILITIES}}

INSTRUCTIONS:
1. **Analyze Intent**: Does the user want a tool? (e.g. "build a commit viewer").
2. **Determine Mode**:
   - "create": MUST generate a tool mutation.
   - "chat": Explain only.
3. **Construct Plan**:
   - Define state variables needed (e.g. "selectedRepo").
   - Define actions (e.g. "fetchCommits").
   - Define UI components (e.g. Input for repo, Button to fetch, Table to show results).
   - Wire events: Input onChange -> update state. Button onClick -> trigger action.

IMPORTANT RULES:
- NEVER guess "resource". Capabilities are invoked by ID and Params only.
- NEVER invent capability params. Use ONLY what is defined in "AVAILABLE CAPABILITIES".
- NEVER output "dashboard" concepts like "metrics" or "views". Use "components".
- If a capability requires a param (e.g. 'repo'), create an Input or Select for it, or bind it to state.

You MUST respond with valid JSON only. Structure:
{
  "plans": [
    {
      "integrationId": "string",
      "capabilityId": "string",
      "params": { ... },
      "explanation": "string",
      "execution_mode": "materialize" | "ephemeral", // "materialize" for App building
      "toolMutation": {
        "pagesAdded": [ { "id": "p1", "name": "Home", "components": [...] } ],
        "componentsAdded": [ ... ],
        "actionsAdded": [ { "id": "a1", "type": "integration_call", "config": ... } ],
        "stateAdded": { "repo": "assemblr" }
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
        `- ID: ${c.id}\n  Integration: ${c.integrationId}\n  Params: ${c.supportedFields.join(", ")}${c.constraints?.requiredFilters ? `\n  REQUIRED PARAMS: ${c.constraints.requiredFilters.join(", ")}` : ""}`
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
