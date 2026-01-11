import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { DiscoveredSchema } from "@/lib/schema/types";
import { Metric } from "@/lib/metrics/store";
import { CompiledIntent } from "@/lib/core/intent";
import { PolicyEngine } from "@/lib/governance/engine";
import { OrgPolicy } from "@/lib/core/governance";

const policyEngine = new PolicyEngine();

const SYSTEM_PROMPT = `
You are the Assemblr Mini App Architect.
Your job is to translate user natural language into a deterministic, EXECUTABLE system intent.

CORE RESPONSIBILITY:
- Analyze the user's goal.
- Compile it into a machine-readable "CompiledIntent" structure.
- Ensure the resulting Mini App is INTERACTIVE, WIRED, and RUNNABLE.

AVAILABLE CAPABILITIES:
{{CAPABILITIES}}

HARD CONSTRAINTS (STRICT ENFORCEMENT):
1. **ALLOWED COMPONENTS ONLY**:
   - Container, Text, Button, Input, Select, List, Table, Card, Heatmap.
   - BANNED: Panel, Banner, Modal, Dialog, Sidebar, etc.
   - MAPPINGS:
     - "Panel" -> Container (variant="card") or Card
     - "Banner" -> Container + Text
     - "Sidebar" -> Container (column, fixed width)
     - "Detail Panel" -> Card inside Container

2. **EXECUTION & WIRING RULES (MANDATORY)**:
   - **NO ACTION WITHOUT EVENT**: Every Action MUST be triggered by a Component Event (onClick, onChange, onLoad). Unreachable actions are FORBIDDEN.
   - **NO DATA WITHOUT STATE**: Integration calls MUST write to state. UI MUST read from state.
     - Pattern: Event -> Action (integration_call) -> State Update (assign) -> Component (dataSource/bindKey).
   - **NO EMPTY SUCCESS**: At least one component MUST render data or respond to interaction. Static/empty shells are failures.

3. **STATE MANAGEMENT**:
   - Every integration_call action MUST have a \`config.assign\` property specifying the state key to update (e.g. "commits", "repos").
   - Components MUST bind to these keys via \`dataSource: { type: "state", value: "key" }\` or \`properties.bindKey\`.

4. **REAL CAPABILITIES ONLY**:
   - Use ONLY the provided Capability IDs.
   - NO mocks, NO placeholders, NO "fake" data.

INSTRUCTIONS:
1. **Analyze Intent**:
   - "Show me commits" -> intent_type: "chat" (but if building a tool, use "create")
   - "Build a commit viewer" -> intent_type: "create"
   - "Add a table of issues" -> intent_type: "modify"
2. **Tool Mutation**:
   - Define "tool_mutation" with pages, components, actions, state.
   - **Container Layouts**: Use "container" with properties.layout="row"|"column"|"grid"|"freeform".
   - **Data Binding**:
     - Action: \`config.assign: "myKey"\`
     - Component: \`dataSource: { type: "state", value: "myKey" }\`
3. **Validation**:
   - Before outputting, verify: Is every action wired? Is state used? Are components valid?

You MUST respond with valid JSON only. Structure:
{
  "intent_type": "chat" | "create" | "modify" | "analyze",
  "system_goal": "string",
  "constraints": ["string"],
  "integrations_required": ["github"],
  "output_mode": "mini_app",
  "execution_policy": { "deterministic": true, "parallelizable": false, "retries": 0 },
  "tool_mutation": {
    "pagesAdded": [{ "id": "p1", "components": [] }],
    "componentsAdded": [
      {
        "id": "c1", "type": "button", "pageId": "p1", "label": "Load",
        "events": [{ "type": "onClick", "actionId": "a1" }]
      },
      {
        "id": "c2", "type": "table", "pageId": "p1",
        "dataSource": { "type": "state", "value": "commits" },
        "properties": { "columns": [{ "key": "message", "label": "Message" }] }
      }
    ],
    "actionsAdded": [
      {
        "id": "a1", "type": "integration_call",
        "config": {
          "capabilityId": "github_commits_list",
          "params": { "owner": "assemblr", "repo": "assemblr" },
          "assign": "commits"
        }
      }
    ],
    "stateAdded": { "commits": [] }
  }
}
`;

function validateCompiledIntent(intent: CompiledIntent) {
  if (intent.intent_type !== "create" && intent.intent_type !== "modify") return;
  const mutation = intent.tool_mutation;
  if (!mutation) return;

  // 1. Validate Component Types
  const allowedTypes = new Set(["container", "text", "button", "input", "select", "dropdown", "list", "table", "card", "heatmap"]);
  const components = mutation.componentsAdded || [];
  for (const c of components) {
    if (!allowedTypes.has(c.type.toLowerCase())) {
      throw new Error(`Unsupported component type: ${c.type}. Allowed: ${Array.from(allowedTypes).join(", ")}`);
    }
  }

  // 2. Validate Event Wiring
  const actions = mutation.actionsAdded || [];
  const actionIds = new Set(actions.map((a: any) => a.id));
  const triggeredActions = new Set<string>();

  for (const c of components) {
    if (c.events) {
      for (const e of c.events) {
        if (e.actionId) triggeredActions.add(e.actionId);
      }
    }
  }
  if (mutation.pagesAdded) {
    for (const p of mutation.pagesAdded) {
      if (p.events) {
        for (const e of p.events) {
          if (e.actionId) triggeredActions.add(e.actionId);
        }
      }
    }
  }

  for (const id of actionIds) {
    if (!triggeredActions.has(id)) {
      throw new Error(`Action ${id} is defined but never triggered by any component or page event.`);
    }
  }

  // 3. Validate Integration State Binding
  const stateKeysRead = new Set<string>();
  for (const c of components) {
    if (c.dataSource?.type === "state" && c.dataSource.value) {
      stateKeysRead.add(c.dataSource.value);
    }
    if (c.properties?.bindKey) {
      stateKeysRead.add(c.properties.bindKey);
    }
    if (c.type === "text" && typeof c.properties?.content === "string") {
      const matches = c.properties.content.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
      if (matches) {
        matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
      }
    }
  }

  for (const a of actions) {
    if (a.type === "integration_call") {
      const assignKey = a.config?.assign;
      if (!assignKey && !stateKeysRead.has(`${a.id}.data`)) {
        throw new Error(`Integration action ${a.id} does not assign result to state (config.assign) nor is its default output (${a.id}.data) read by any component.`);
      }
      if (assignKey && !stateKeysRead.has(assignKey)) {
        throw new Error(`Integration action ${a.id} assigns to state key '${assignKey}', but no component reads this key.`);
      }
    }
  }
}

export async function compileIntent(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = [],
  mode: "create" | "chat" = "create",
  policies: OrgPolicy[] = [] // Added policies
): Promise<CompiledIntent> {
  getServerEnv();

  // Filter registry to only connected integrations AND Policy Allowed
  const connectedCapabilities = CAPABILITY_REGISTRY.filter((c) => {
    // 1. Check Connectivity
    if (!connectedIntegrationIds.includes(c.integrationId)) return false;

    // 2. Check Governance Policy
    const policyResult = policyEngine.evaluate(policies, {
        integrationId: c.integrationId,
        capabilityId: c.id,
        actionType: "capability_usage"
    });
    
    // If blocked, we exclude it from the prompt so the planner doesn't even try to use it.
    // This is "Policy-Aware Planning" - prevention by omission.
    return policyResult.allowed;
  });

  const capsText = connectedCapabilities
    .map(
      (c) =>
        `- ID: ${c.id}\n  Integration: ${c.integrationId}\n  Params: ${c.supportedFields.join(", ")}${c.constraints?.requiredFilters ? `\n  REQUIRED PARAMS: ${c.constraints.requiredFilters.join(", ")}` : ""}`
    )
    .join("\n\n");

  const prompt = (SYSTEM_PROMPT
    .replace("{{CAPABILITIES}}", capsText)) + `\n\nMODE HINT: ${mode.toUpperCase()}`;

  try {
    const contextMessages = history.map(m => ({
      role: m.role,
      content: m.content
    })).slice(-10);

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
    
    // Validate the intent
    validateCompiledIntent(result as CompiledIntent);

    return result as CompiledIntent;
  } catch (err) {
    console.error("Intent compilation failed", err);
    throw new Error(`Failed to compile user intent: ${err instanceof Error ? err.message : String(err)}`);
  }
}

