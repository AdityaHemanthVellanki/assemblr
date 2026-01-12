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
import type { ToolSpec } from "@/lib/spec/toolSpec";

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

5. **TOOL CONTINUITY & COMPOSABILITY (CRITICAL)**:
   - You are modifying a persistent tool runtime, not starting from scratch.
   - You will be given TOOL_MEMORY (current pages, components, state, actions, bindings, and learned patterns).
   - You MUST prefer reusing and extending existing structure over adding parallel duplicates.
     - If a "repo selector" pattern exists, reuse it instead of adding a new selector.
     - If a "data fetch + loading + empty + error" pipeline exists, reuse it and add a new table/list bound to the same selection state.
   - Multi-page composition is allowed and encouraged:
     - Add pages when the user asks, or when separation improves clarity.
     - Navigation must be explicit and user-visible (buttons/links triggering navigation actions).
   - Names are first-class:
     - Prefer stable, user-friendly names for pages, components, actions, and state keys.
     - If user requests renames, use pagesUpdated/componentsUpdated/actionsUpdated/stateRenamed rather than rebuilding.
   - Derived state is allowed but must be deterministic and safe:
     - Only allow filtering/sorting/grouping/aggregation/mapping based on existing state.
     - Represent derived rules in state key "__derivations" and bind derived outputs via state.

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
   - Before outputting, verify: Did you reuse existing patterns in TOOL_MEMORY? Did you avoid duplicates?
 
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
    "toolPropsUpdated": { "title": "string?", "description": "string?" },
    "pagesAdded": [{ "id": "p1", "components": [] }],
    "pagesUpdated": [{ "pageRef": "home page", "patch": { "name": "string?", "layoutMode": "grid|stack" } }],
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
    "actionsUpdated": [{ "actionRef": "load commits", "patch": { "config": { } } }],
    "stateRenamed": [{ "from": "oldKey", "to": "newKey" }],
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

function flattenMiniAppComponents(mini: any): Array<{ pageId: string; component: any }> {
  const out: Array<{ pageId: string; component: any }> = [];
  for (const p of mini?.pages ?? []) {
    for (const c of p.components ?? []) {
      out.push({ pageId: p.id, component: c });
      const stack: any[] = Array.isArray(c.children) ? [...c.children] : [];
      while (stack.length) {
        const node = stack.shift();
        if (!node) continue;
        out.push({ pageId: p.id, component: node });
        if (Array.isArray(node.children)) stack.push(...node.children);
      }
    }
  }
  return out;
}

function buildToolMemory(spec?: ToolSpec): any {
  if (!spec || (spec as any).kind !== "mini_app") return { kind: (spec as any)?.kind ?? "unknown" };
  const mini: any = spec as any;
  const flat = flattenMiniAppComponents(mini);

  const components = flat.map(({ pageId, component }) => ({
    id: component.id,
    pageId,
    type: component.type,
    label: component.label,
    dataSource: component.dataSource,
    properties: {
      title: component.properties?.title,
      bindKey: component.properties?.bindKey,
      loadingKey: component.properties?.loadingKey,
      errorKey: component.properties?.errorKey,
      emptyMessage: component.properties?.emptyMessage,
    },
    events: component.events ?? [],
  }));

  const actions = (mini.actions ?? []).map((a: any) => ({
    id: a.id,
    type: a.type,
    config: a.config,
    steps: a.steps,
  }));

  const stateKeys = Object.keys(mini.state ?? {}).filter((k) => !(k.startsWith("_") || k.startsWith("__")));

  const componentsByActionId: Record<string, Array<{ id: string; pageId: string; type: string; label?: string }>> = {};
  for (const { pageId, component } of flat) {
    for (const e of component.events ?? []) {
      if (!e?.actionId) continue;
      componentsByActionId[e.actionId] = componentsByActionId[e.actionId] ?? [];
      componentsByActionId[e.actionId].push({ id: component.id, pageId, type: component.type, label: component.label });
    }
  }

  const readersByStateKey: Record<string, Array<{ id: string; pageId: string; type: string; label?: string }>> = {};
  for (const { pageId, component } of flat) {
    const keys: string[] = [];
    if (component.dataSource?.type === "state" && typeof component.dataSource.value === "string") keys.push(component.dataSource.value);
    if (typeof component.properties?.bindKey === "string") keys.push(component.properties.bindKey);
    if (typeof component.properties?.loadingKey === "string") keys.push(component.properties.loadingKey);
    if (typeof component.properties?.errorKey === "string") keys.push(component.properties.errorKey);
    for (const k of keys) {
      readersByStateKey[k] = readersByStateKey[k] ?? [];
      readersByStateKey[k].push({ id: component.id, pageId, type: component.type, label: component.label });
    }
  }

  const pipelines = actions
    .filter((a: any) => a.type === "integration_call")
    .map((a: any) => {
      const assignKey = a.config?.assign;
      const statusKey = assignKey ? `${assignKey}Status` : `${a.id}.status`;
      const errorKey = assignKey ? `${assignKey}Error` : `${a.id}.error`;
      return {
        actionId: a.id,
        capabilityId: a.config?.capabilityId,
        assignKey,
        triggerComponents: componentsByActionId[a.id] ?? [],
        readers: assignKey ? readersByStateKey[assignKey] ?? [] : readersByStateKey[`${a.id}.data`] ?? [],
        statusReaders: readersByStateKey[statusKey] ?? [],
        errorReaders: readersByStateKey[errorKey] ?? [],
      };
    });

  return {
    kind: mini.kind,
    title: mini.title,
    description: mini.description,
    pages: (mini.pages ?? []).map((p: any) => ({ id: p.id, name: p.name, layoutMode: p.layoutMode, componentCount: (p.components ?? []).length })),
    stateKeys,
    components,
    actions,
    pipelines,
  };
}

function validateCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec) {
  if (intent.intent_type !== "create" && intent.intent_type !== "modify") return;
  const mutation = intent.tool_mutation;
  if (!mutation) return;

  const existingMini = currentSpec && (currentSpec as any).kind === "mini_app" ? (currentSpec as any) : null;
  const existingComponents = existingMini ? flattenMiniAppComponents(existingMini).map((x) => x.component) : [];
  const existingPages = existingMini ? (existingMini.pages ?? []) : [];
  const existingActions = existingMini ? (existingMini.actions ?? []) : [];

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

  const collectTriggered = (node: any) => {
    if (node?.events) {
      for (const e of node.events) {
        if (e?.actionId) triggeredActions.add(e.actionId);
      }
    }
  };

  for (const c of components) collectTriggered(c);
  if (mutation.pagesAdded) {
    for (const p of mutation.pagesAdded) {
      collectTriggered(p);
    }
  }
  if (mutation.componentsUpdated) {
    for (const u of mutation.componentsUpdated) {
      if (u?.patch?.events) collectTriggered({ events: u.patch.events });
    }
  }
  if (existingMini) {
    for (const p of existingPages) {
      collectTriggered(p);
      for (const c of p.components ?? []) {
        const stack: any[] = [c];
        while (stack.length) {
          const n = stack.shift();
          if (!n) continue;
          collectTriggered(n);
          if (Array.isArray(n.children)) stack.push(...n.children);
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
  if (existingMini) {
    for (const c of existingComponents) collectReadKeys(c);
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
        if (key.startsWith("_") || key.startsWith("__")) continue;
        if (!stateKeysRead.has(key)) {
          throw new Error(`Action ${a.id} mutates state key '${key}', but no component reads this key. Visible reaction required.`);
        }
      }
    }
  }

  if (existingMini) {
    const existingPairs = new Set(
      existingComponents
        .map((c: any) => {
          const bk = typeof c.properties?.bindKey === "string" ? c.properties.bindKey : "";
          const pid = existingPages.find((p: any) => (p.components ?? []).some((x: any) => x === c))?.id ?? "";
          return `${String(c.type).toLowerCase()}::${pid}::${bk}`;
        })
        .filter((x: string) => !x.endsWith("::")),
    );
    for (const c of components) {
      const bk = typeof c.properties?.bindKey === "string" ? c.properties.bindKey : "";
      if (!bk) continue;
      const pid = c.pageId ?? "";
      const key = `${String(c.type).toLowerCase()}::${pid}::${bk}`;
      if (existingPairs.has(key)) {
        throw new Error(`Duplicate control detected: a ${c.type} already binds to '${bk}' on page '${pid}'. Reuse the existing component instead of creating a parallel one.`);
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
  policies: OrgPolicy[] = [], // Added policies
  currentSpec?: ToolSpec,
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

  const toolMemory = buildToolMemory(currentSpec);
  const prompt =
    SYSTEM_PROMPT.replace("{{CAPABILITIES}}", capsText) +
    `\n\nMODE HINT: ${mode.toUpperCase()}\n\nTOOL_MEMORY (authoritative; reuse this structure):\n${JSON.stringify(toolMemory, null, 2)}`;

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
    validateCompiledIntent(parsed, currentSpec);
    return parsed;
  } catch (error) {
    console.error("Intent compilation failed:", error);
    throw error;
  }
}
