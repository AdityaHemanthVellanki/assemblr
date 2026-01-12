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
 
3. **STATE MANAGEMENT & FEEDBACK LOOPS (CRITICAL)**:
   - **ASYNC STATUS KEYS**: For every integration_call, you MUST track its status in state.
     - Pattern: \`config.assign: "commits"\` -> System automatically manages \`commitsStatus\` ("idle"|"loading"|"success"|"error").
   - **VISIBLE FEEDBACK**: 
     - Components MUST bind to these status keys to show loading/error states.
     - Example: Table with \`properties.loadingKey: "commitsStatus"\`, \`properties.errorKey: "commitsError"\`.
   - **EMPTY STATES**:
     - Lists/Tables MUST have \`properties.emptyMessage\` explaining what to do next (e.g. "No commits found. Select a repo.").
 
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
     - Status: Component properties \`loadingKey: "myKeyStatus"\`, \`errorKey: "myKeyError"\`.
   - Before outputting, verify: Is every action wired? Is state used? Are components valid? Is feedback visible?
 
You MUST respond with valid JSON only. Structure:
{
  "intent_type": "chat" | "create" | "modify" | "analyze",
  "mutation_kind": "add" | "modify" | "restructure" | "remove" | "style" | "wire",
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
        "properties": { 
          "columns": [{ "key": "message", "label": "Message" }],
          "loadingKey": "commitsStatus",
          "errorKey": "commitsError",
          "emptyMessage": "No commits found. Click Load to fetch."
        }
      }
    ],
    "componentsUpdated": [
      { "componentRef": "commits table", "patch": { "properties": { "columns": [{ "key": "sha", "label": "SHA" }, { "key": "message", "label": "Message" }] } } }
    ],
    "containerPropsUpdated": [
      { "componentRef": "main container", "propertiesPatch": { "layout": "row", "gap": 2 } }
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
    "stateAdded": { "commits": [], "commitsStatus": "idle", "commitsError": null }
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

  // 3. Validate State Usage (Mutations -> UI)
  const stateKeysRead = new Set<string>();
  const collectReadKeys = (c: any) => {
    if (c.dataSource?.type === "state" && c.dataSource.value) {
      stateKeysRead.add(c.dataSource.value);
    }
    if (c.properties?.bindKey) stateKeysRead.add(c.properties.bindKey);
    if (c.properties?.loadingKey) stateKeysRead.add(c.properties.loadingKey);
    if (c.properties?.errorKey) stateKeysRead.add(c.properties.errorKey);
    if (c.properties?.data && typeof c.properties.data === "string" && c.properties.data.startsWith("{{state.")) {
      const match = c.properties.data.match(/^{{state\.([a-zA-Z0-9_.$-]+)}}$/);
      if (match) stateKeysRead.add(match[1]);
    }
    if (c.type === "text" && typeof c.properties?.content === "string") {
      const matches = c.properties.content.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
      if (matches) {
        matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
      }
    }
  };

  for (const c of components) collectReadKeys(c);
  // Also check componentsUpdated
  if (mutation.componentsUpdated) {
    for (const update of mutation.componentsUpdated) {
      if (update.patch) collectReadKeys({ properties: update.patch.properties, dataSource: update.patch.dataSource });
    }
  }

  for (const a of actions) {
    if (a.type === "integration_call") {
      const assignKey = a.config?.assign;
      if (!assignKey && !stateKeysRead.has(`${a.id}.data`)) {
        throw new Error(`Integration action ${a.id} does not assign result to state (config.assign) nor is its default output (${a.id}.data) read by any component.`);
      }
      if (assignKey) {
        if (!stateKeysRead.has(assignKey)) {
          throw new Error(`Integration action ${a.id} assigns to state key '${assignKey}', but no component reads this key.`);
        }
        // Enforce feedback loop
        const statusKey = `${assignKey}Status`;
        if (!stateKeysRead.has(statusKey)) {
           // We might want to relax this for simple "chat" responses, but for "create"/"modify" apps it's critical.
           // The user said: "Components MUST bind to these status keys".
           throw new Error(`Integration action ${a.id} implies status key '${statusKey}', but no component binds to it (loadingKey). Feedback loop missing.`);
        }
      }
    }
    if (a.type === "state_mutation") {
      const updates = a.config?.updates ?? a.config?.set ?? {};
      for (const key of Object.keys(updates)) {
        if (!stateKeysRead.has(key)) {
          throw new Error(`Action ${a.id} mutates state key '${key}', but no component reads this key. Visible reaction required.`);
        }
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
    }));

    const response = await azureOpenAIClient.chat.completions.create({
      messages: [
        { role: "system", content: prompt },
        ...contextMessages,
        { role: "user", content: userMessage }
      ],
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);
    validateCompiledIntent(parsed);
    return parsed;
  } catch (error) {
    console.error("Intent compilation failed:", error);
    throw error;
  }
}
