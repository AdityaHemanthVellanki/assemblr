import "server-only";

import { createHash } from "crypto";
import { ActionSpec, EntitySpec, IntegrationId, IntegrationIdSchema, TOOL_SPEC_VERSION, ToolSystemSpec, ToolSystemSpecSchema, ViewSpec } from "@/lib/toolos/spec";
import { loadMemory, saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { getCapabilitiesForIntegration, getCapability } from "@/lib/capabilities/registry";
import { runUnderstandPurpose } from "@/lib/toolos/compiler/stages/understand-purpose";
import { runExtractEntities } from "@/lib/toolos/compiler/stages/extract-entities";
import { runResolveIntegrations } from "@/lib/toolos/compiler/stages/resolve-integrations";
import { runDefineActions } from "@/lib/toolos/compiler/stages/define-actions";
import { runFetchData } from "@/lib/toolos/compiler/stages/fetch-data";
import { runBuildWorkflows } from "@/lib/toolos/compiler/stages/build-workflows";
import { runDesignViews } from "@/lib/toolos/compiler/stages/design-views";
import { runValidateSpec } from "@/lib/toolos/compiler/stages/validate-spec";
import { getExecutionById } from "@/lib/toolos/executions";

export type ToolCompilerStage =
  | "understand-purpose"
  | "extract-entities"
  | "resolve-integrations"
  | "define-actions"
  | "fetch-data"
  | "build-workflows"
  | "design-views"
  | "validate-spec";

export type ToolCompilerProgressEvent = {
  stage: ToolCompilerStage;
  status: "started" | "completed";
  message: string;
};

export type ToolCompilerStageResult = {
  specPatch?: Partial<ToolSystemSpec>;
  clarifications?: string[];
  logs?: string[];
};

export type ToolCompilerStageContext = {
  prompt: string;
  spec: ToolSystemSpec;
  connectedIntegrationIds: string[];
  onUsage?: (usage?: { total_tokens?: number }) => Promise<void> | void;
  orgId: string;
  toolId: string;
  userId?: string | null;
};

export type ToolCompilerStageBudgets = {
  understandPurposeMs: number;
  extractEntitiesMs: number;
  resolveIntegrationsMs: number;
  defineActionsMs: number;
  fetchDataMs: number;
  buildWorkflowsMs: number;
  designViewsMs: number;
  validateSpecMs: number;
};

export type ToolCompilerInput = {
  prompt: string;
  sessionId: string;
  userId?: string | null;
  orgId: string;
  toolId: string;
  connectedIntegrationIds?: string[];
  executionId?: string;
  stageBudgets?: Partial<ToolCompilerStageBudgets>;
  onProgress?: (event: ToolCompilerProgressEvent) => void;
  onUsage?: (usage?: { total_tokens?: number }) => Promise<void> | void;
};

export type ToolCompilerResult = {
  spec: ToolSystemSpec;
  clarifications: string[];
  status: "completed" | "degraded";
  progress: ToolCompilerProgressEvent[];
};

const DEFAULT_BUDGETS: ToolCompilerStageBudgets = {
  understandPurposeMs: 1500,
  extractEntitiesMs: 1500,
  resolveIntegrationsMs: 1000,
  defineActionsMs: 2000,
  fetchDataMs: 5000, // Allow more time for network calls
  buildWorkflowsMs: 2000,
  designViewsMs: 2000,
  validateSpecMs: 1500,
};

const BUILDER_NAMESPACE = "tool_builder";

export class ToolCompiler {
  static async run(input: ToolCompilerInput): Promise<ToolCompilerResult> {
    // HARD ASSERTIONS for Canonical Context
    if (!input.orgId) throw new Error("ToolCompiler: orgId is required (must be authoritative)");
    if (!input.toolId) throw new Error("ToolCompiler: toolId is required");
    if (input.executionId) {
      const execution = await getExecutionById(input.executionId);
      if (!execution) {
        throw new Error("Execution not found");
      }
      if (["compiling", "executing", "completed"].includes(execution.status)) {
        return { 
          spec: execution.tool_version_id ? {} as any : {} as any, // Placeholder as we're skipping
          clarifications: [],
          status: "completed",
          progress: [],
          skip_compile: true,
          executionId: input.executionId
        } as any;
      }
    }
    // input.userId is optional (can be system/anonymous), but if provided should be valid.

    const budgets = { ...DEFAULT_BUDGETS, ...(input.stageBudgets ?? {}) };
    const progress: ToolCompilerProgressEvent[] = [];
    const emitProgress = (event: ToolCompilerProgressEvent) => {
      progress.push(event);
      input.onProgress?.(event);
    };

    const sessionScope: MemoryScope = { type: "session", sessionId: input.sessionId };
    const toolScope: MemoryScope = { type: "tool_org", toolId: input.toolId, orgId: input.orgId };

    const [sessionSpec, toolSpec] = await Promise.all([
      loadMemory({ scope: sessionScope, namespace: BUILDER_NAMESPACE, key: "partial_spec" }),
      loadMemory({ scope: toolScope, namespace: BUILDER_NAMESPACE, key: "partial_spec" }),
    ]);
    const baseSpec = buildBaseSpec(input.prompt, input.toolId);
    let spec = mergeSpec(baseSpec, sessionSpec ?? toolSpec ?? {});

    const stageContextBase = {
      prompt: input.prompt,
      connectedIntegrationIds: input.connectedIntegrationIds ?? [],
      onUsage: input.onUsage,
      orgId: input.orgId,
      toolId: input.toolId,
      userId: input.userId,
    };

    const stageResults: Array<{
      stage: ToolCompilerStage;
      result?: ToolCompilerStageResult;
      timedOut?: boolean;
    }> = [];

    let degraded = false;
    const runStage = async (
      stage: ToolCompilerStage,
      budgetMs: number,
      runner: (ctx: ToolCompilerStageContext) => Promise<ToolCompilerStageResult>,
    ) => {
      if (shouldSkipStage(stage, spec)) {
        emitProgress({ stage, status: "completed", message: `${stageLabel(stage)} done` });
        return { status: "completed" as const };
      }
      if (budgetMs <= 0) {
        degraded = true;
        emitProgress({ stage, status: "completed", message: `${stageLabel(stage)} skipped` });
        return { status: "completed" as const };
      }
      emitProgress({ stage, status: "started", message: stageLabel(stage) });
      const { result, timedOut } = await runWithBudget(budgetMs, () =>
        runner({ ...stageContextBase, spec }),
      );
      if (timedOut) {
        degraded = true;
        emitProgress({ stage, status: "completed", message: `${stageLabel(stage)} timed out` });
        stageResults.push({ stage, timedOut: true });
        return { status: "completed" as const };
      }
      if (result && "error" in result) {
        const errorMessage =
          result.error instanceof Error ? result.error.message : String(result.error ?? "Stage failed");
        degraded = true;
        emitProgress({ stage, status: "completed", message: errorMessage });
        await persistPartialSpec(spec, sessionScope, toolScope);
        return { status: "completed" as const };
      }
      if (result?.specPatch) {
        spec = mergeSpec(spec, result.specPatch);
      }
      await persistPartialSpec(spec, sessionScope, toolScope);
      stageResults.push({ stage, result });
      const clarifications = result?.clarifications ?? [];
      if (clarifications.length > 0) {
        degraded = true;
        emitProgress({ stage, status: "completed", message: `${stageLabel(stage)} defaulted` });
        return { status: "completed" as const };
      }
      emitProgress({ stage, status: "completed", message: `${stageLabel(stage)} done` });
      return { status: "completed" as const };
    };

    const stages: Array<() => Promise<{ status: "completed"; clarifications?: string[] }>> = [
      () => runStage("understand-purpose", budgets.understandPurposeMs, runUnderstandPurpose),
      () => runStage("extract-entities", budgets.extractEntitiesMs, runExtractEntities),
      () => runStage("resolve-integrations", budgets.resolveIntegrationsMs, runResolveIntegrations),
      () => runStage("define-actions", budgets.defineActionsMs, runDefineActions),
      () => runStage("fetch-data", budgets.fetchDataMs, runFetchData),
      () => runStage("build-workflows", budgets.buildWorkflowsMs, runBuildWorkflows),
      () => runStage("design-views", budgets.designViewsMs, runDesignViews),
      () => runStage("validate-spec", budgets.validateSpecMs, runValidateSpec),
    ];

    for (const stage of stages) {
      await stage();
    }

    spec = ensureMinimumSpec(spec, input.prompt, input.connectedIntegrationIds ?? []);
    const validation = ToolSystemSpecSchema.safeParse(spec);
    if (!validation.success) {
      degraded = true;
      emitProgress({ stage: "validate-spec", status: "completed", message: "Validation defaulted" });
      return {
        spec: ensureMinimumSpec(spec, input.prompt, input.connectedIntegrationIds ?? []),
        clarifications: [],
        status: "degraded",
        progress,
      };
    }

    return {
      spec,
      clarifications: [],
      status: degraded ? "degraded" : "completed",
      progress,
    };
  }
}

async function runWithBudget<T>(budgetMs: number, runner: () => Promise<T>) {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeout = new Promise<{ timedOut: true }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true }), budgetMs);
  });
  try {
    const raced = await Promise.race([
      runner()
        .then((result) => ({ timedOut: false as const, result }))
        .catch((error) => ({ timedOut: false as const, result: { error } as any })),
      timeout,
    ]);
    if ("timedOut" in raced && raced.timedOut) {
      return { timedOut: true as const };
    }
    return { timedOut: false as const, result: (raced as { result: T }).result };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function stageLabel(stage: ToolCompilerStage) {
  if (stage === "understand-purpose") return "Understanding purpose";
  if (stage === "extract-entities") return "Extracting entities";
  if (stage === "resolve-integrations") return "Resolving integrations";
  if (stage === "define-actions") return "Defining actions";
  if (stage === "build-workflows") return "Building workflows";
  if (stage === "design-views") return "Designing views";
  return "Validating spec";
}

function shouldSkipStage(stage: ToolCompilerStage, spec: ToolSystemSpec) {
  if (stage === "understand-purpose") return Boolean(spec.name && spec.purpose);
  if (stage === "extract-entities") return spec.entities.length > 0;
  if (stage === "resolve-integrations") return spec.integrations.length > 0;
  if (stage === "define-actions") return spec.actions.length > 0;
  if (stage === "build-workflows") return spec.workflows.length > 0;
  if (stage === "design-views") return spec.views.length > 0;
  return false;
}

function mergeSpec(base: ToolSystemSpec, patch: Partial<ToolSystemSpec>): ToolSystemSpec {
  const nextState = patch.state
    ? {
        ...base.state,
        ...patch.state,
        initial: { ...base.state.initial, ...(patch.state.initial ?? {}) },
        reducers: patch.state.reducers ?? base.state.reducers,
        graph: patch.state.graph ?? base.state.graph,
      }
    : base.state;

  return {
    ...base,
    ...patch,
    entities: patch.entities ?? base.entities,
    actions: patch.actions ?? base.actions,
    workflows: patch.workflows ?? base.workflows,
    triggers: patch.triggers ?? base.triggers,
    views: patch.views ?? base.views,
    goal_plan: patch.goal_plan ?? base.goal_plan,
    intent_contract: patch.intent_contract ?? base.intent_contract,
    semantic_plan: patch.semantic_plan ?? base.semantic_plan,
    derived_entities: patch.derived_entities ?? base.derived_entities,
    answer_contract: patch.answer_contract ?? base.answer_contract,
    query_plans: patch.query_plans ?? base.query_plans,
    tool_graph: patch.tool_graph ?? base.tool_graph,
    permissions: patch.permissions ?? base.permissions,
    integrations: patch.integrations ?? base.integrations,
    memory: patch.memory ?? base.memory,
    automations: patch.automations ?? base.automations,
    observability: patch.observability ?? base.observability,
    stateGraph: patch.stateGraph ?? base.stateGraph,
    state: nextState,
  };
}

function buildBaseSpec(prompt: string, toolId: string): ToolSystemSpec {
  const id = createHash("sha256").update(`${toolId}:${prompt}`).digest("hex");
  return {
    id,
    name: "Tool",
    purpose: prompt,
    spec_version: TOOL_SPEC_VERSION,
    created_at: new Date().toISOString(),
    source_prompt: prompt,
    entities: [],
    actionGraph: { nodes: [], edges: [] },
    state: { initial: {}, reducers: [], graph: { nodes: [], edges: [] } },
    actions: [],
    workflows: [],
    triggers: [],
    views: [],
    goal_plan: undefined,
    intent_contract: undefined,
    semantic_plan: undefined,
    derived_entities: [],
    query_plans: [],
    permissions: { roles: [], grants: [] },
    integrations: [],
    memory: {
      tool: { namespace: id, retentionDays: 30, schema: {} },
      user: { namespace: id, retentionDays: 30, schema: {} },
    },
    automations: {
      enabled: true,
      capabilities: {
        canRunWithoutUI: true,
        supportedTriggers: [],
        maxFrequency: 1440,
        safetyConstraints: ["approval_required_for_writes"],
      },
    },
    observability: {
      executionTimeline: true,
      recentRuns: true,
      errorStates: true,
      integrationHealth: true,
      manualRetryControls: true,
    },
  };
}

async function persistPartialSpec(
  spec: ToolSystemSpec,
  sessionScope: MemoryScope,
  toolScope: MemoryScope,
) {
  try {
    await saveMemory({
      scope: sessionScope,
      namespace: BUILDER_NAMESPACE,
      key: "partial_spec",
      value: spec,
    });
  } catch (err) {
    console.warn("[PartialSpecPersistenceFailed]", err);
  }
  try {
    await saveMemory({
      scope: toolScope,
      namespace: BUILDER_NAMESPACE,
      key: "partial_spec",
      value: spec,
    });
  } catch (err) {
    console.warn("[PartialSpecPersistenceFailed]", err);
  }
}

function ensureMinimumSpec(
  spec: ToolSystemSpec,
  prompt: string,
  connectedIntegrationIds: string[],
): ToolSystemSpec {
  const detectedIntegrations = detectIntegrations(prompt);
  const connectedIntegrations = connectedIntegrationIds
    .map((id) => IntegrationIdSchema.safeParse(id))
    .filter((result) => result.success)
    .map((result) => result.data);
  const integrationIds: IntegrationId[] =
    spec.integrations.length > 0
      ? spec.integrations.map((i) => i.id)
      : detectedIntegrations.length > 0
        ? detectedIntegrations
        : connectedIntegrations.length > 0
          ? connectedIntegrations
        : ["google"];

  const integrations =
    spec.integrations.length > 0
      ? spec.integrations
      : integrationIds.map((id) => ({
          id,
          capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
        }));

  let actions = spec.actions;
  if (actions.length === 0) {
    actions = integrationIds.flatMap((integration) => buildFallbackActionsForIntegration(integration));
  }

  let reducers = spec.state.reducers;
  if (reducers.length === 0) {
    reducers = actions.map((action) => {
      const cap = getCapability(action.capabilityId);
      const resource = cap?.resource ?? "data";
      return {
        id: `reduce.${action.id}`,
        type: "set",
        target: `${action.integrationId}.${resource}`,
      };
    });
    actions = actions.map((action, index) => ({
      ...action,
      reducerId: reducers[index]?.id,
    }));
  }

  let entities = spec.entities;
  if (entities.length === 0) {
    entities = integrationIds.flatMap((integration) => buildFallbackEntitiesForIntegration(integration));
  }

  let views = spec.views;
  if (views.length === 0) {
    views = entities.map((entity, index) =>
      buildFallbackViewForEntity(entity, actions, index),
    );
  }

  const graphNodes = [
    ...reducers.map((r) => ({ id: r.id, kind: "state" as const })),
    ...actions.map((a) => ({ id: a.id, kind: "action" as const })),
  ];
  const graphEdges = actions
    .filter((a) => a.reducerId)
    .map((a) => ({ from: a.id, to: a.reducerId!, actionId: a.id }));

  return {
    ...spec,
    integrations,
    actions,
    entities,
    views,
    stateGraph: { nodes: graphNodes, edges: graphEdges },
    actionGraph: {
      nodes: actions.map((a) => ({ id: a.id, actionId: a.id })),
      edges: [],
    },
    state: {
      ...spec.state,
      reducers,
      graph: { nodes: graphNodes, edges: graphEdges },
    },
  };
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

function buildFallbackAction(integration: IntegrationId): ActionSpec {
  if (integration === "google") {
    return {
      id: "google.listEmails",
      name: "List emails",
      description: "List recent Gmail emails",
      type: "READ",
      integrationId: "google",
      capabilityId: "google_gmail_list",
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    };
  }
  if (integration === "github") {
    return {
      id: "github.listRepos",
      name: "List repositories",
      description: "List GitHub repositories",
      type: "READ",
      integrationId: "github",
      capabilityId: "github_repos_list",
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    };
  }
  if (integration === "linear") {
    return {
      id: "linear.listIssues",
      name: "List issues",
      description: "List Linear issues",
      type: "READ",
      integrationId: "linear",
      capabilityId: "linear_issues_list",
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    };
  }
  if (integration === "slack") {
    return {
      id: "slack.listMessages",
      name: "List messages",
      description: "List Slack messages",
      type: "READ",
      integrationId: "slack",
      capabilityId: "slack_messages_list",
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    };
  }
  return {
    id: "notion.listPages",
    name: "List pages",
    description: "List Notion pages",
    type: "READ",
    integrationId: "notion",
    capabilityId: "notion_pages_search",
    inputSchema: {},
    outputSchema: {},
    writesToState: false,
  };
}

function buildFallbackActionsForIntegration(integration: IntegrationId): ActionSpec[] {
  if (integration === "github") {
    return [
      {
        id: "github.listRepos",
        name: "List repositories",
        description: "List GitHub repositories",
        type: "READ",
        integrationId: "github",
        capabilityId: "github_repos_list",
        inputSchema: buildDefaultInputForCapability("github_repos_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "github.listIssues",
        name: "List issues",
        description: "List GitHub issues",
        type: "READ",
        integrationId: "github",
        capabilityId: "github_issues_list",
        inputSchema: buildDefaultInputForCapability("github_issues_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "slack") {
    return [
      {
        id: "slack.listMessages",
        name: "List messages",
        description: "List Slack messages",
        type: "READ",
        integrationId: "slack",
        capabilityId: "slack_messages_list",
        inputSchema: buildDefaultInputForCapability("slack_messages_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "google") {
    return [
      {
        id: "google.listEmails",
        name: "List emails",
        description: "List recent Gmail emails",
        type: "READ",
        integrationId: "google",
        capabilityId: "google_gmail_list",
        inputSchema: buildDefaultInputForCapability("google_gmail_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "linear") {
    return [
      {
        id: "linear.listIssues",
        name: "List issues",
        description: "List Linear issues",
        type: "READ",
        integrationId: "linear",
        capabilityId: "linear_issues_list",
        inputSchema: buildDefaultInputForCapability("linear_issues_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  return [
    {
      id: "notion.listPages",
      name: "List pages",
      description: "List Notion pages",
      type: "READ",
      integrationId: "notion",
      capabilityId: "notion_pages_search",
      inputSchema: buildDefaultInputForCapability("notion_pages_search"),
      outputSchema: {},
      writesToState: false,
      confidenceLevel: "medium",
    },
  ];
}

function buildFallbackEntity(integration: IntegrationId): EntitySpec {
  if (integration === "google") {
    return {
      name: "Email",
      sourceIntegration: "google",
      relations: [],
      identifiers: ["id", "threadId"],
      supportedActions: ["google.gmail.list", "google.gmail.reply"],
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
      identifiers: ["id", "fullName"],
      supportedActions: ["github.repos.list"],
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
      identifiers: ["id"],
      supportedActions: ["linear.issues.list"],
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
      identifiers: ["id", "timestamp"],
      supportedActions: ["slack.messages.list", "slack.messages.post"],
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
    identifiers: ["id"],
    supportedActions: ["notion.pages.search", "notion.databases.list"],
    fields: [
      { name: "id", type: "string", required: true },
      { name: "title", type: "string" },
      { name: "lastEdited", type: "string" },
    ],
  };
}

function buildFallbackEntitiesForIntegration(integration: IntegrationId): EntitySpec[] {
  if (integration === "github") {
    return [
      {
        name: "Issue",
        sourceIntegration: "github",
        relations: [],
        identifiers: ["id", "number"],
        supportedActions: ["github.issues.list"],
        behaviors: [
          "Blocked = status == blocked OR label contains \"blocked\"",
          "High severity = priority <= 2 OR label contains \"sev-1\"",
        ],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "title", type: "string" },
          { name: "status", type: "string" },
          { name: "assignee", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "PullRequest",
        sourceIntegration: "github",
        relations: [],
        identifiers: ["id", "number"],
        supportedActions: ["github.issues.list"],
        behaviors: [
          "Blocked = status == blocked OR label contains \"blocked\"",
          "High severity = priority <= 2 OR label contains \"sev-1\"",
        ],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "title", type: "string" },
          { name: "status", type: "string" },
          { name: "assignee", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Repository",
        sourceIntegration: "github",
        relations: [],
        identifiers: ["id", "fullName"],
        supportedActions: ["github.repos.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "owner", type: "string" },
          { name: "stars", type: "number" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "slack") {
    return [
      {
        name: "Message",
        sourceIntegration: "slack",
        relations: [],
        identifiers: ["id", "timestamp"],
        supportedActions: ["slack.messages.list", "slack.messages.post"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "channel", type: "string" },
          { name: "text", type: "string" },
          { name: "timestamp", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Channel",
        sourceIntegration: "slack",
        relations: [],
        identifiers: ["id", "name"],
        supportedActions: ["slack.channels.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "linear") {
    return [
      {
        name: "Issue",
        sourceIntegration: "linear",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["linear.issues.list"],
        behaviors: [
          "Blocked = status == blocked OR label contains \"blocked\"",
          "High severity = priority <= 2 OR label contains \"sev-1\"",
        ],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "title", type: "string" },
          { name: "status", type: "string" },
          { name: "assignee", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "notion") {
    return [
      {
        name: "Page",
        sourceIntegration: "notion",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["notion.pages.search", "notion.databases.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "title", type: "string" },
          { name: "lastEdited", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  return [
    {
      name: "Email",
      sourceIntegration: "google",
      relations: [],
      identifiers: ["id", "threadId"],
      supportedActions: ["google.gmail.list", "google.gmail.reply"],
      fields: [
        { name: "id", type: "string", required: true },
        { name: "subject", type: "string" },
        { name: "from", type: "string" },
        { name: "date", type: "string" },
      ],
      confidenceLevel: "medium",
    },
  ];
}

function buildFallbackView(
  integration: IntegrationId,
  entity: ToolSystemSpec["entities"][number] | undefined,
  action: ToolSystemSpec["actions"][number] | undefined,
): ViewSpec {
  if (integration === "google") {
    return {
      id: "view.emails",
      name: "Emails",
      type: "table",
      source: { entity: entity?.name ?? "Email", statePath: "google.emails" },
      fields: ["subject", "from", "date"],
      actions: action ? [action.id] : [],
    };
  }
  if (integration === "github") {
    return {
      id: "view.repos",
      name: "Repos",
      type: "table",
      source: { entity: entity?.name ?? "Repo", statePath: "github.repos" },
      fields: ["name", "owner", "stars"],
      actions: action ? [action.id] : [],
    };
  }
  if (integration === "linear") {
    return {
      id: "view.issues",
      name: "Issues",
      type: "kanban",
      source: { entity: entity?.name ?? "Issue", statePath: "linear.issues" },
      fields: ["title", "status", "assignee"],
      actions: action ? [action.id] : [],
    };
  }
  if (integration === "slack") {
    return {
      id: "view.messages",
      name: "Messages",
      type: "table",
      source: { entity: entity?.name ?? "Message", statePath: "slack.messages" },
      fields: ["channel", "text", "timestamp"],
      actions: action ? [action.id] : [],
    };
  }
  return {
    id: "view.pages",
    name: "Pages",
    type: "table",
    source: { entity: entity?.name ?? "Page", statePath: "notion.pages" },
    fields: ["title", "lastEdited"],
    actions: action ? [action.id] : [],
  };
}

function buildFallbackViewForEntity(
  entity: ToolSystemSpec["entities"][number],
  actions: ToolSystemSpec["actions"][number][],
  index: number,
): ViewSpec {
  const action = actions.find((a) => a.integrationId === entity.sourceIntegration);
  const viewId = `view.${entity.sourceIntegration}.${entity.name.toLowerCase()}.${index + 1}`;
  const type = entity.name === "Issue" ? "kanban" : "table";
  const entityKey = (() => {
    const lower = entity.name.toLowerCase();
    if (lower === "repository") return "repos";
    if (lower === "pullrequest") return "pullRequests";
    if (lower === "channel") return "channels";
    if (lower === "message") return "messages";
    if (lower === "email") return "emails";
    if (lower === "issue") return "issues";
    if (lower === "page") return "pages";
    return `${lower}s`;
  })();
  const statePath = `${entity.sourceIntegration}.${entityKey}`;
  const fields = entity.fields.slice(0, 4).map((f) => f.name);
  return {
    id: viewId,
    name: entity.name,
    type,
    source: { entity: entity.name, statePath },
    fields,
    actions: action ? [action.id] : [],
  };
}

function buildDefaultInputForCapability(capabilityId: string) {
  const cap = getCapability(capabilityId);
  if (!cap) return {};
  const input: Record<string, any> = {};
  if (cap.supportedFields.includes("maxResults")) input.maxResults = 5;
  if (cap.supportedFields.includes("pageSize")) input.pageSize = 5;
  if (cap.supportedFields.includes("first")) input.first = 5;
  if (cap.supportedFields.includes("limit")) input.limit = 5;
  if (cap.supportedFields.includes("channel")) input.channel = "general";
  if (cap.supportedFields.includes("repo")) input.repo = "all";
  if (cap.supportedFields.includes("owner")) input.owner = "self";
  if (cap.supportedFields.includes("database_id")) input.database_id = "default";
  return input;
}
