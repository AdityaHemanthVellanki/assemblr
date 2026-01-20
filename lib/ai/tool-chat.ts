import "server-only";

import { createHash } from "crypto";
import { getServerEnv } from "@/lib/env";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { ToolSystemSpecSchema, ToolSystemSpec, IntegrationId, StateReducer } from "@/lib/toolos/spec";
import { getCapabilitiesForIntegration, getCapability } from "@/lib/capabilities/registry";
import { compileToolSystem } from "@/lib/toolos/compiler";
import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadToolMemory, saveToolMemory } from "@/lib/toolos/memory-store";
import { ExecutionTracer } from "@/lib/observability/tracer";

export interface ToolChatRequest {
  orgId: string;
  toolId: string;
  currentSpec?: unknown;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
  mode: "create" | "modify" | "chat";
  integrationMode?: "auto" | "manual";
  selectedIntegrationIds?: string[];
}

export interface ToolChatResponse {
  explanation: string;
  message: { type: "text"; content: string };
  spec?: unknown;
  metadata?: Record<string, any>;
}

type BuildStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "success" | "error";
  logs: string[];
};

type IntentAnalysis = {
  clarifications: string[];
  assumptions: string[];
};


const capabilityCatalog = ["google", "slack", "github", "linear", "notion"]
  .map((provider) => {
    const ids = getCapabilitiesForIntegration(provider).map((c) => c.id);
    return `${provider}: ${ids.join(", ")}`;
  })
  .join("\n");

const INTENT_SYSTEM_PROMPT = `
You are a ToolSpec compiler. You must output a single JSON object that matches this schema:
{
  "id": string,
  "purpose": string,
  "entities": [{ "name": string, "fields": [{ "name": string, "type": string, "required": boolean? }], "sourceIntegration": "google" | "slack" | "github" | "linear" | "notion", "relations"?: [{ "name": string, "target": string, "type": "one_to_one" | "one_to_many" | "many_to_many" }], "behaviors": string[]? }],
  "state": {
    "initial": object,
    "reducers": [{ "id": string, "type": "set" | "merge" | "append" | "remove", "target": string }],
    "graph": { "nodes": [{ "id": string, "kind": "state" | "action" | "workflow" }], "edges": [{ "from": string, "to": string, "actionId"?: string, "workflowId"?: string }] }
  },
  "actions": [{ "id": string, "name": string, "description": string, "integrationId": "google" | "slack" | "github" | "linear" | "notion", "capabilityId": string, "inputSchema": object, "outputSchema": object, "reducerId"?: string, "emits"?: string[], "requiresApproval"?: boolean, "permissions"?: string[] }],
  "workflows": [{ "id": string, "name": string, "description": string, "nodes": [{ "id": string, "type": "action" | "condition" | "transform" | "wait", "actionId"?: string, "condition"?: string, "transform"?: string, "waitMs"?: number }], "edges": [{ "from": string, "to": string }], "retryPolicy": { "maxRetries": number, "backoffMs": number }, "timeoutMs": number }],
  "triggers": [{ "id": string, "name": string, "type": "cron" | "webhook" | "integration_event" | "state_condition", "condition": object, "actionId"?: string, "workflowId"?: string, "enabled": boolean }],
  "views": [{ "id": string, "name": string, "type": "table" | "kanban" | "timeline" | "chat" | "form" | "inspector" | "command", "source": { "entity": string, "statePath": string }, "fields": string[], "actions": string[] }],
  "permissions": { "roles": [{ "id": string, "name": string, "inherits"?: string[] }], "grants": [{ "roleId": string, "scope": "entity" | "action" | "workflow" | "view", "targetId": string, "access": "read" | "write" | "execute" | "approve" }] },
  "integrations": [{ "id": "google" | "slack" | "github" | "linear" | "notion", "capabilities": string[] }],
  "memory": { "tool": { "namespace": string, "retentionDays": number, "schema": object }, "user": { "namespace": string, "retentionDays": number, "schema": object } }
}
Do not include any additional keys. Output JSON only.
All requested integrations must appear in integrations and be used by entities and actions.
Views must only reference state keys and actions.
Valid capabilities by provider:
${capabilityCatalog}
`;

export async function processToolChat(
  input: ToolChatRequest,
): Promise<ToolChatResponse> {
  getServerEnv();

  if (input.mode !== "create") {
    throw new Error("Only create mode is supported in compiler pipeline");
  }

  const steps = createBuildSteps();
  const builderNamespace = "tool_builder";
  const pendingQuestions = await loadToolMemory({
    toolId: input.toolId,
    orgId: input.orgId,
    namespace: builderNamespace,
    key: "pending_questions",
  });
  const basePrompt = await loadToolMemory({
    toolId: input.toolId,
    orgId: input.orgId,
    namespace: builderNamespace,
    key: "base_prompt",
  });
  const prompt = pendingQuestions
    ? `${basePrompt ?? ""}\nClarifications:\n${String(pendingQuestions)}\nUser answers: ${input.userMessage}`
    : input.userMessage;

  const stepsById = new Map(steps.map((s) => [s.id, s]));
  let spec: ToolSystemSpec;

  try {
    markStep(steps, "intent", "running", "Parsing prompt and intent");
    const intentAgent = await runIntentAgent(prompt);
    const clarifications = mergeClarifications(intentAgent.clarifications, prompt);
    if (!pendingQuestions && clarifications.length > 0) {
      markStep(steps, "intent", "error", "Clarifications required");
      await saveToolMemory({
        toolId: input.toolId,
        orgId: input.orgId,
        namespace: builderNamespace,
        key: "pending_questions",
        value: clarifications,
      });
      await saveToolMemory({
        toolId: input.toolId,
        orgId: input.orgId,
        namespace: builderNamespace,
        key: "base_prompt",
        value: input.userMessage,
      });
      return {
        explanation: "Clarifications needed",
        message: { type: "text", content: formatClarificationPrompt(clarifications) },
        metadata: { persist: false, build_steps: steps, clarifications },
      };
    }

    spec = await generateIntent(prompt);
    markStep(steps, "intent", "success", "Intent captured");
    markStep(steps, "entities", "success", `Entities: ${spec.entities.map((e) => e.name).join(", ") || "none"}`);
    markStep(steps, "integrations", "success", `Integrations: ${spec.integrations.map((i) => i.id).join(", ") || "none"}`);
    markStep(steps, "actions", "success", `Actions: ${spec.actions.length}`);
    markStep(steps, "workflows", "success", `Workflows: ${spec.workflows.length}`);
    markStep(steps, "compile", "running", "Validating spec and runtime wiring");
    compileToolSystem(spec);
    markStep(steps, "compile", "success", "Runtime compiled");
    markStep(steps, "views", "running", "Preparing runtime views");

    const missingIntegrations = spec.integrations
      .map((i) => i.id)
      .filter((id) => !input.connectedIntegrationIds.includes(id));
    if (missingIntegrations.length > 0) {
      markStep(steps, "readiness", "error", `Missing integrations: ${missingIntegrations.join(", ")}`);
      await saveToolMemory({
        toolId: input.toolId,
        orgId: input.orgId,
        namespace: builderNamespace,
        key: "pending_questions",
        value: missingIntegrations.map((id) => `Connect ${id} to fetch data.`),
      });
      return {
        explanation: "Missing integrations",
        message: {
          type: "text",
          content: `Connect these integrations to proceed: ${missingIntegrations.join(", ")}.`,
        },
        spec,
        metadata: { persist: true, build_steps: steps, missing_integrations: missingIntegrations },
      };
    }

    markStep(steps, "readiness", "running", "Validating data readiness");
    const readiness = await runDataReadiness(spec, input.orgId);
    readiness.logs.forEach((log) => appendStep(stepsById.get("readiness"), log));
    if (readiness.clarifications.length > 0) {
      markStep(steps, "readiness", "error", "Missing required filters");
      await saveToolMemory({
        toolId: input.toolId,
        orgId: input.orgId,
        namespace: builderNamespace,
        key: "pending_questions",
        value: readiness.clarifications,
      });
      return {
        explanation: "Clarifications needed for data",
        message: { type: "text", content: formatClarificationPrompt(readiness.clarifications) },
        spec,
        metadata: { persist: true, build_steps: steps, clarifications: readiness.clarifications },
      };
    }
    markStep(steps, "readiness", "success", "Data readiness checks complete");

    markStep(steps, "runtime", "running", "Executing initial fetches");
    const execution = await runInitialFetches(spec, input.orgId, input.toolId);
    execution.logs.forEach((log) => appendStep(stepsById.get("runtime"), log));
    if (execution.empty.length > 0) {
      markStep(steps, "runtime", "error", "No data returned");
      return {
        explanation: "No data returned",
        message: {
          type: "text",
          content: `No data returned from ${execution.empty.join(", ")}. Refine filters or confirm access.`,
        },
        spec,
        metadata: { persist: true, build_steps: steps, empty_sources: execution.empty },
      };
    }
    markStep(steps, "runtime", "success", "Initial data loaded");
    markStep(steps, "views", "success", `Views: ${spec.views.length}`);
    await saveToolMemory({
      toolId: input.toolId,
      orgId: input.orgId,
      namespace: builderNamespace,
      key: "pending_questions",
      value: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Build failed";
    markStep(steps, "compile", "error", message);
    throw err;
  }

  return {
    explanation: spec.purpose,
    message: { type: "text", content: spec.purpose },
    spec,
    metadata: { persist: true, build_steps: steps, query_plans: buildQueryPlans(spec) },
  };
}

async function generateIntent(prompt: string): Promise<ToolSystemSpec> {
  const requiredIntegrations = detectIntegrations(prompt);
  const enforcedPrompt = requiredIntegrations.length
    ? `${prompt}\n\nYou MUST include these integrations as sections: ${requiredIntegrations.join(", ")}.`
    : prompt;
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: enforcedPrompt },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  const first = parseIntent(content);
  if (first.ok) {
    enforceRequiredIntegrations(first.value, requiredIntegrations);
    return first.value;
  }

  const retry = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Your last response was invalid: ${first.error}. Return ONLY valid JSON for the same request: ${enforcedPrompt}`,
      },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });

  const retryContent = retry.choices[0]?.message?.content;
  const second = parseIntent(retryContent);
  if (!second.ok) {
    return buildFallbackToolSpec(prompt, requiredIntegrations);
  }
  enforceRequiredIntegrations(second.value, requiredIntegrations);
  return second.value;
}

function parseIntent(
  content: string | null | undefined,
): { ok: true; value: ToolSystemSpec } | { ok: false; error: string } {
  if (!content || typeof content !== "string") {
    return { ok: false, error: "empty response" };
  }
  if (!content.trim().startsWith("{")) {
    return { ok: false, error: "non-JSON response" };
  }
  try {
    const parsed = JSON.parse(content);
    const validated = ToolSystemSpecSchema.parse(parsed) as ToolSystemSpec;
    return { ok: true, value: validated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid JSON";
    return { ok: false, error: msg };
  }
}

function detectIntegrations(text: string): Array<ToolSystemSpec["integrations"][number]["id"]> {
  const normalized = text.toLowerCase();
  const hits = new Set<ToolSystemSpec["integrations"][number]["id"]>();
  if (normalized.includes("google") || normalized.includes("gmail") || normalized.includes("drive")) hits.add("google");
  if (normalized.includes("github")) hits.add("github");
  if (normalized.includes("slack")) hits.add("slack");
  if (normalized.includes("notion")) hits.add("notion");
  if (normalized.includes("linear")) hits.add("linear");
  return Array.from(hits);
}

function enforceRequiredIntegrations(
  intent: ToolSystemSpec,
  required: Array<ToolSystemSpec["integrations"][number]["id"]>,
) {
  if (required.length === 0) return;
  const present = new Set(intent.integrations.map((s) => s.id));
  const missing = required.filter((id) => !present.has(id));
  if (missing.length > 0) {
    throw new Error(`Planner missing integrations: ${missing.join(", ")}`);
  }
}

function createBuildSteps(): BuildStep[] {
  return [
    { id: "intent", title: "Understanding intent", status: "pending", logs: [] },
    { id: "entities", title: "Identifying entities", status: "pending", logs: [] },
    { id: "integrations", title: "Selecting integrations", status: "pending", logs: [] },
    { id: "actions", title: "Defining actions", status: "pending", logs: [] },
    { id: "workflows", title: "Assembling workflows", status: "pending", logs: [] },
    { id: "compile", title: "Compiling runtime", status: "pending", logs: [] },
    { id: "readiness", title: "Validating data readiness", status: "pending", logs: [] },
    { id: "runtime", title: "Executing initial fetch", status: "pending", logs: [] },
    { id: "views", title: "Rendering views", status: "pending", logs: [] },
  ];
}

function markStep(steps: BuildStep[], id: string, status: BuildStep["status"], log?: string) {
  const step = steps.find((s) => s.id === id);
  if (!step) return;
  step.status = status;
  if (log) step.logs.push(log);
}

function appendStep(step: BuildStep | undefined, log: string) {
  if (!step) return;
  step.logs.push(log);
}

async function runIntentAgent(prompt: string): Promise<IntentAnalysis> {
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content: `Return JSON: {"clarifications": string[], "assumptions": string[]}. Ask for missing limits, filters, channels, or correlation logic.`,
      },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 300,
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) return { clarifications: [], assumptions: [] };
  try {
    const json = JSON.parse(content);
    const clarifications = Array.isArray(json.clarifications) ? json.clarifications.filter((q: any) => typeof q === "string") : [];
    const assumptions = Array.isArray(json.assumptions) ? json.assumptions.filter((q: any) => typeof q === "string") : [];
    return { clarifications, assumptions };
  } catch {
    return { clarifications: [], assumptions: [] };
  }
}

function mergeClarifications(clarifications: string[], prompt: string) {
  const lower = prompt.toLowerCase();
  const merged = new Set(clarifications);
  const hasNumber = /\b\d+\b/.test(prompt);
  if (lower.includes("latest") && !hasNumber) {
    merged.add("How many items should load by default?");
  }
  if (lower.includes("support") && (lower.includes("email") || lower.includes("gmail"))) {
    merged.add("Which sender, label, or keyword defines a support email?");
  }
  if (lower.includes("slack") && !lower.includes("#")) {
    merged.add("Which Slack channel should updates be posted to?");
  }
  if (lower.includes("related issues") || lower.includes("correlate")) {
    merged.add("How should emails be matched to issues (subject, sender, keyword)?");
  }
  return Array.from(merged);
}

async function runDataReadiness(spec: ToolSystemSpec, orgId: string) {
  const clarifications: string[] = [];
  const logs: string[] = [];

  for (const action of spec.actions) {
    const cap = getCapability(action.capabilityId);
    if (!cap) continue;
    const required = cap.constraints?.requiredFilters ?? [];
    const missing = required.filter((field) => !(action.inputSchema && field in action.inputSchema));
    if (missing.length > 0) {
      clarifications.push(
        `Provide ${missing.join(", ")} for ${action.name} (${action.integrationId}).`,
      );
      continue;
    }

    if (!cap.allowedOperations.includes("read")) continue;
    const input = buildDefaultInput(cap);
    try {
      const runtime = RUNTIMES[action.integrationId];
      const token = await getValidAccessToken(orgId, action.integrationId);
      const context = await runtime.resolveContext(token);
      const executor = runtime.capabilities[action.capabilityId];
      const output = await executor.execute(input, context, new ExecutionTracer("run"));
      const count = Array.isArray(output) ? output.length : output ? 1 : 0;
      logs.push(`${action.integrationId} ready (sample size: ${count}).`);
    } catch (err) {
      logs.push(`${action.integrationId} readiness failed: ${err instanceof Error ? err.message : "error"}.`);
    }
  }

  return { clarifications, logs };
}

async function runInitialFetches(
  spec: ToolSystemSpec,
  orgId: string,
  toolId: string,
) {
  const logs: string[] = [];
  const empty: string[] = [];
  const actionIds = new Set<string>();
  for (const view of spec.views) {
    view.actions.forEach((id) => actionIds.add(id));
  }
  for (const action of spec.actions.filter((a) => actionIds.has(a.id))) {
    const cap = getCapability(action.capabilityId);
    if (!cap || !cap.allowedOperations.includes("read")) continue;
    const input = buildDefaultInput(cap);
    try {
      const result = await executeToolAction({
        orgId,
        toolId,
        spec,
        actionId: action.id,
        input,
      });
      const count = Array.isArray(result.output) ? result.output.length : result.output ? 1 : 0;
      logs.push(`Fetched ${count} from ${action.integrationId}.`);
      if (count === 0) empty.push(action.integrationId);
    } catch (err) {
      logs.push(`Fetch failed for ${action.integrationId}: ${err instanceof Error ? err.message : "error"}.`);
      empty.push(action.integrationId);
    }
  }
  return { logs, empty };
}

function buildDefaultInput(cap: NonNullable<ReturnType<typeof getCapability>>) {
  const input: Record<string, any> = {};
  if (cap.supportedFields.includes("maxResults")) input.maxResults = 5;
  if (cap.supportedFields.includes("pageSize")) input.pageSize = 5;
  if (cap.supportedFields.includes("first")) input.first = 5;
  if (cap.supportedFields.includes("limit")) input.limit = 5;
  return input;
}

function buildQueryPlans(spec: ToolSystemSpec) {
  return spec.actions.map((action) => {
    const cap = getCapability(action.capabilityId);
    const limit = cap ? buildDefaultInput(cap) : {};
    return {
      actionId: action.id,
      integrationId: action.integrationId,
      capabilityId: action.capabilityId,
      initial: limit,
      pagination: "limit",
      refresh: "manual",
    };
  });
}

function formatClarificationPrompt(questions: string[]) {
  return `I need a few details to finish this tool:\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
}

function buildFallbackToolSpec(
  prompt: string,
  integrations: Array<ToolSystemSpec["integrations"][number]["id"]>,
): ToolSystemSpec {
  const normalized: IntegrationId[] = (integrations.length > 0 ? integrations : ["google"]) as IntegrationId[];
  const id = createHash("sha256").update(prompt).digest("hex");
  const actions = normalized.map((integration): ToolSystemSpec["actions"][number] => {
    if (integration === "google") {
      return {
        id: "google.listEmails",
        name: "List emails",
        description: "List recent Gmail emails",
        integrationId: "google",
        capabilityId: "google_gmail_list",
        inputSchema: {},
        outputSchema: {},
        reducerId: "set_emails",
      };
    }
    if (integration === "github") {
      return {
        id: "github.listRepos",
        name: "List repositories",
        description: "List GitHub repositories",
        integrationId: "github",
        capabilityId: "github_repos_list",
        inputSchema: {},
        outputSchema: {},
        reducerId: "set_repos",
      };
    }
    if (integration === "linear") {
      return {
        id: "linear.listIssues",
        name: "List issues",
        description: "List Linear issues",
        integrationId: "linear",
        capabilityId: "linear_issues_list",
        inputSchema: {},
        outputSchema: {},
        reducerId: "set_issues",
      };
    }
    if (integration === "slack") {
      return {
        id: "slack.listMessages",
        name: "List messages",
        description: "List Slack messages",
        integrationId: "slack",
        capabilityId: "slack_messages_list",
        inputSchema: {},
        outputSchema: {},
        reducerId: "set_messages",
      };
    }
    return {
      id: "notion.listPages",
      name: "List pages",
      description: "List Notion pages",
      integrationId: "notion",
      capabilityId: "notion_pages_search",
      inputSchema: {},
      outputSchema: {},
      reducerId: "set_pages",
    };
  });

  const reducers: StateReducer[] = [
    { id: "set_emails", type: "set", target: "google.emails" },
    { id: "set_repos", type: "set", target: "github.repos" },
    { id: "set_issues", type: "set", target: "linear.issues" },
    { id: "set_messages", type: "set", target: "slack.messages" },
    { id: "set_pages", type: "set", target: "notion.pages" },
  ];

  const entities = normalized.map((integration): ToolSystemSpec["entities"][number] => {
    if (integration === "google") {
      return {
        name: "Email",
        sourceIntegration: "google",
        relations: [],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "subject", type: "string" },
          { name: "from", type: "string" },
          { name: "date", type: "string" },
        ],
      };
    }
    if (integration === "github") {
      return {
        name: "Repo",
        sourceIntegration: "github",
        relations: [],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "owner", type: "string" },
          { name: "stars", type: "number" },
        ],
      };
    }
    if (integration === "linear") {
      return {
        name: "Issue",
        sourceIntegration: "linear",
        relations: [],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "title", type: "string" },
          { name: "status", type: "string" },
          { name: "assignee", type: "string" },
        ],
      };
    }
    if (integration === "slack") {
      return {
        name: "Message",
        sourceIntegration: "slack",
        relations: [],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "channel", type: "string" },
          { name: "text", type: "string" },
          { name: "timestamp", type: "string" },
        ],
      };
    }
    return {
      name: "Page",
      sourceIntegration: "notion",
      relations: [],
      fields: [
        { name: "id", type: "string", required: true },
        { name: "title", type: "string" },
        { name: "lastEdited", type: "string" },
      ],
    };
  });

  const views = normalized.map((integration): ToolSystemSpec["views"][number] => {
    const action = actions.find((a) => a.integrationId === integration);
    if (integration === "google") {
      return {
        id: "view.emails",
        name: "Emails",
        type: "table",
        source: { entity: "Email", statePath: "google.emails" },
        fields: ["subject", "from", "date"],
        actions: action ? [action.id] : [],
      };
    }
    if (integration === "github") {
      return {
        id: "view.repos",
        name: "Repos",
        type: "table",
        source: { entity: "Repo", statePath: "github.repos" },
        fields: ["name", "owner", "stars"],
        actions: action ? [action.id] : [],
      };
    }
    if (integration === "linear") {
      return {
        id: "view.issues",
        name: "Issues",
        type: "kanban",
        source: { entity: "Issue", statePath: "linear.issues" },
        fields: ["title", "status", "assignee"],
        actions: action ? [action.id] : [],
      };
    }
    if (integration === "slack") {
      return {
        id: "view.messages",
        name: "Messages",
        type: "table",
        source: { entity: "Message", statePath: "slack.messages" },
        fields: ["channel", "text", "timestamp"],
        actions: action ? [action.id] : [],
      };
    }
    return {
      id: "view.pages",
      name: "Pages",
      type: "table",
      source: { entity: "Page", statePath: "notion.pages" },
      fields: ["title", "lastEdited"],
      actions: action ? [action.id] : [],
    };
  });

  return {
    id,
    purpose: prompt,
    entities,
    state: {
      initial: {},
      reducers,
      graph: {
        nodes: [
          ...reducers.map((r) => ({ id: r.id, kind: "state" as const })),
          ...actions.map((a) => ({ id: a.id, kind: "action" as const })),
        ],
        edges: actions
          .filter((a) => a.reducerId)
          .map((a) => ({ from: a.id, to: a.reducerId!, actionId: a.id })),
      },
    },
    actions,
    workflows: [],
    triggers: [],
    views,
    permissions: { roles: [{ id: "owner", name: "Owner" }], grants: [] },
    integrations: normalized.map((id) => ({
      id,
      capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
    })),
    memory: {
      tool: { namespace: id, retentionDays: 30, schema: {} },
      user: { namespace: id, retentionDays: 30, schema: {} },
    },
  };
}
