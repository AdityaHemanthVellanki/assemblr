// import "server-only";

import { createHash } from "crypto";
import { ActionSpec, EntitySpec, IntegrationId, IntegrationIdSchema, TOOL_SPEC_VERSION, ToolSystemSpec, ToolSystemSpecSchema, ViewSpec } from "@/lib/toolos/spec";
import { detectIntegrationsFromText } from "@/lib/integrations/detection";
import { loadMemory, saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { capabilityRegistry } from "@/lib/capabilities/synthesis/registry";
import { Capability } from "@/lib/capabilities/types";
import { runUnderstandPurpose } from "@/lib/toolos/compiler/stages/understand-purpose";
import { runExtractEntities } from "@/lib/toolos/compiler/stages/extract-entities";
import { runResolveIntegrations } from "@/lib/toolos/compiler/stages/resolve-integrations";
import { runDefineActions } from "@/lib/toolos/compiler/stages/define-actions";
import { runCheckIntegrationReadiness } from "@/lib/toolos/compiler/stages/check-integration-readiness";
import { runFetchData } from "@/lib/toolos/compiler/stages/fetch-data";
import { runBuildWorkflows } from "@/lib/toolos/compiler/stages/build-workflows";
import { runDesignViews } from "@/lib/toolos/compiler/stages/design-views";
import { runValidateSpec } from "@/lib/toolos/compiler/stages/validate-spec";
import { runGenerateQueryPlans } from "@/lib/toolos/compiler/stages/generate-query-plans";
import { getExecutionById } from "@/lib/toolos/executions";

export type ToolCompilerStage =
  | "understand-purpose"
  | "extract-entities"
  | "resolve-integrations"
  | "define-actions"
  | "generate-query-plans"
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
  capabilities: Capability[];
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

import { canExecuteTool } from "@/lib/toolos/lifecycle";

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
        const canExecute = await canExecuteTool({ toolId: input.toolId });
        if (canExecute.ok) {
          return {
            spec: buildBaseSpec(input.prompt, input.toolId),
            clarifications: [],
            status: "completed",
            progress: [],
          };
        }
        console.warn(
          `[ToolCompiler] Execution ${input.executionId} is ${execution.status} but tool ${input.toolId} is not runnable (${canExecute.reason}). Forcing recompilation.`,
        );
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

    // Prefetch capabilities for connected integrations
    const connectedIds = input.connectedIntegrationIds ?? [];
    const connectedIntegrations = connectedIds.map(id => ({ integrationId: id, entityId: input.orgId }));
    const capabilities = await capabilityRegistry.getAllCapabilities(connectedIntegrations);

    const baseSpec = buildBaseSpec(input.prompt, input.toolId);
    let spec = mergeSpec(baseSpec, sessionSpec ?? toolSpec ?? {});

    const stageContextBase = {
      prompt: input.prompt,
      connectedIntegrationIds: connectedIds,
      onUsage: input.onUsage,
      orgId: input.orgId,
      toolId: input.toolId,
      userId: input.userId,
      capabilities,
    };

    const stageResults: Array<{
      stage: ToolCompilerStage;
      result?: ToolCompilerStageResult;
      timedOut?: boolean;
    }> = [];

    let degraded = false;
    const isCompilerError = (error: any) =>
      Boolean(
        error &&
        typeof error === "object" &&
        error.type === "COMPILER_ERROR" &&
        error.code &&
        error.stage,
      );
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
        const errorValue = (result as any).error;
        if (isCompilerError(errorValue)) {
          const compilerError =
            errorValue instanceof Error
              ? errorValue
              : Object.assign(new Error(errorValue.message ?? "Compiler error"), errorValue);
          throw compilerError;
        }
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

    // Stage 1: understand-purpose (must run first)
    await runStage("understand-purpose", budgets.understandPurposeMs, runUnderstandPurpose);

    // Stage 2+3: extract-entities + resolve-integrations (independent, run in parallel)
    await Promise.all([
      runStage("extract-entities", budgets.extractEntitiesMs, runExtractEntities),
      runStage("resolve-integrations", budgets.resolveIntegrationsMs, runResolveIntegrations),
    ]);

    // Stage 4: define-actions (depends on entities + integrations)
    await runStage("define-actions", budgets.defineActionsMs, runDefineActions);

    // Stage 5: generate-query-plans (deterministic, fast — depends on actions)
    await runStage("generate-query-plans", 500, runGenerateQueryPlans);

    // Stage 6: Integration Readiness Gate
    // Instead of throwing when some integrations are missing, strip them and continue
    // with the connected ones. Only throw if ALL integrations are missing.
    await (async () => {
      try {
        return await runCheckIntegrationReadiness({ spec, orgId: input.orgId });
      } catch (error: any) {
        if (error.constructor.name === "IntegrationNotConnectedError" || error.type === "INTEGRATION_NOT_CONNECTED") {
          const missingIds: string[] = error.integrationIds ?? [];
          // Check if any integrations remain after stripping
          const allRequired = Array.from(new Set([
            ...(spec.integrations ?? []).map((i: any) => i.id),
            ...(spec.actions ?? []).map((a: any) => a.integrationId).filter(Boolean),
          ]));
          const connected = allRequired.filter((id: string) => !missingIds.includes(id));

          if (connected.length === 0) {
            throw error; // ALL missing — propagate to UI
          }

          // Strip unconnected integrations from spec and continue
          console.log(`[Compiler] Stripping unconnected integrations: ${missingIds.join(", ")}. Continuing with: ${connected.join(", ")}`);
          spec.integrations = spec.integrations.filter((i: any) => !missingIds.includes(i.id));
          spec.actions = spec.actions.filter((a: any) => !missingIds.includes(a.integrationId));
          spec.entities = spec.entities.filter((e: any) => !missingIds.includes(e.sourceIntegration));
          const remainingActionIds = new Set(spec.actions.map((a: any) => a.id));
          spec.views = spec.views
            .map((v: any) => ({ ...v, actions: v.actions.filter((id: string) => remainingActionIds.has(id)) }))
            .filter((v: any) => v.actions.length > 0);
          return { status: "completed" };
        }
        throw error;
      }
    })();

    // Stage 7: fetch-data
    await runStage("fetch-data", budgets.fetchDataMs, runFetchData);

    // Stage 8: build-workflows (skip for read-only tools — saves ~2s)
    const allActionsReadOnly = spec.actions.length > 0 && spec.actions.every((a) => a.type === "READ");
    if (!allActionsReadOnly) {
      await runStage("build-workflows", budgets.buildWorkflowsMs, runBuildWorkflows);
    } else {
      emitProgress({ stage: "build-workflows", status: "completed", message: "Skipped (read-only)" });
    }

    // Stage 9+10: design-views + validate-spec (can run in parallel)
    await Promise.all([
      runStage("design-views", budgets.designViewsMs, runDesignViews),
      runStage("validate-spec", budgets.validateSpecMs, runValidateSpec),
    ]);

    spec = ensureMinimumSpec(spec, input.prompt, input.connectedIntegrationIds ?? [], capabilities);
    const validation = ToolSystemSpecSchema.safeParse(spec);
    if (!validation.success) {
      degraded = true;
      emitProgress({ stage: "validate-spec", status: "completed", message: "Validation failed" });

      // CRITICAL: Validation is a hard gate. Do not return invalid specs.
      const errorDetail = validation.error.issues.map(e => `${e.path.join(".")}: ${e.message}`).join("; ");
      throw new Error(`ToolSpec validation failed: ${errorDetail}`);
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
  if (stage === "generate-query-plans") return "Generating query plans";
  if (stage === "build-workflows") return "Building workflows";
  if (stage === "design-views") return "Designing views";
  return "Validating spec";
}

function shouldSkipStage(stage: ToolCompilerStage, spec: ToolSystemSpec) {
  if (stage === "understand-purpose") return Boolean(spec.name && spec.purpose);
  if (stage === "extract-entities") return spec.entities.length > 0;
  if (stage === "resolve-integrations") return spec.integrations.length > 0;
  if (stage === "define-actions") return spec.actions.length > 0;
  if (stage === "generate-query-plans") return spec.query_plans.length > 0;
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
    description: patch.description ?? base.description,
    version: patch.version ?? base.version,
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
    memory_model: patch.memory_model ?? base.memory_model,
    confidence_level: patch.confidence_level ?? base.confidence_level,
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
    description: prompt,
    purpose: prompt,
    version: TOOL_SPEC_VERSION,
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
    memory_model: {
      tool: { namespace: id, retentionDays: 30, schema: {} },
      user: { namespace: id, retentionDays: 30, schema: {} },
    },
    confidence_level: "medium",
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
  capabilities: Capability[]
): ToolSystemSpec {
  const detectedIntegrations = detectIntegrations(prompt);
  const connectedIntegrations = connectedIntegrationIds
    .map((id) => IntegrationIdSchema.safeParse(id))
    .filter((result) => result.success)
    .map((result) => result.data);

  // Intent → Domain Lock: STRICT FILTERING
  // If the prompt clearly implies specific integrations, we MUST filter out everything else.
  // This prevents "Schema Bleeding" where previous/hallucinated entities (like Repos) appear in Email tools.
  if (detectedIntegrations.length > 0) {
    const allowed = new Set(detectedIntegrations);

    // Filter existing spec elements to match allowed domain
    if (spec.integrations.length > 0) {
      spec.integrations = spec.integrations.filter(i => allowed.has(i.id));
    }
    if (spec.entities.length > 0) {
      spec.entities = spec.entities.filter(e => allowed.has(e.sourceIntegration));
    }
    if (spec.actions.length > 0) {
      spec.actions = spec.actions.filter(a => allowed.has(a.integrationId));
    }
    // Note: Workflows/Views might need filtering too, but they usually depend on actions/entities.
  }

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
        capabilities: capabilities.filter(c => c.integrationId === id).map(c => c.id)
      }));

  let actions = spec.actions;
  if (actions.length === 0) {
    // Always use curated fallback actions — never dump all synthesized
    // Composio capabilities, which would create hundreds of invalid actions.
    // Pass prompt to filter to only relevant actions for the user's request.
    actions = integrationIds.flatMap((integration) =>
      buildFallbackActionsForIntegration(integration, prompt),
    );
  }

  let reducers = spec.state.reducers;
  if (reducers.length === 0) {
    reducers = actions.map((action) => {
      const cap = capabilities.find(c => c.id === action.capabilityId);
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
    entities = integrationIds.flatMap((integration) => buildFallbackEntitiesForIntegration(integration, prompt));
  }

  // Sanitize entity relations: LLM sometimes generates invalid relation objects
  // with missing target or invalid type. Filter them out to prevent validation failures.
  const validRelationTypes = new Set(["one_to_one", "one_to_many", "many_to_many"]);
  entities = entities.map((entity) => ({
    ...entity,
    relations: Array.isArray(entity.relations)
      ? entity.relations.filter(
          (rel) =>
            rel &&
            typeof rel.name === "string" && rel.name.length > 0 &&
            typeof rel.target === "string" && rel.target.length > 0 &&
            validRelationTypes.has(rel.type)
        )
      : entity.relations,
  }));

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
  return detectIntegrationsFromText(text);
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

function buildFallbackActionsForIntegration(integration: IntegrationId, prompt?: string): ActionSpec[] {
  if (integration === "github") {
    const allActions: ActionSpec[] = [
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
        name: "Search issues",
        description: "Search GitHub issues",
        type: "READ",
        integrationId: "github",
        capabilityId: "github_issues_search",
        inputSchema: { q: "is:issue is:open" },
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "github.listCommits",
        name: "List commits",
        description: "List GitHub commits",
        type: "READ",
        integrationId: "github",
        capabilityId: "github_commits_list",
        inputSchema: buildDefaultInputForCapability("github_commits_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    // If we have a prompt, filter to only relevant actions
    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\bcommits?\b|\bcommitted\b|\bpush(es|ed)?\b|\bchanges?\b/.test(p)) {
        filtered.push(allActions[2]); // commits
      }
      if (/\bissues?\b|\bbugs?\b|\btickets?\b/.test(p)) {
        filtered.push(allActions[1]); // issues
      }
      if (/\brepos?\b|\brepositories?\b|\bprojects?\b/.test(p)) {
        filtered.push(allActions[0]); // repos
      }
      if (/\bpull\s*requests?\b|\bPRs?\b|\bmerge\b/.test(p)) {
        filtered.push(allActions[1]); // PRs use issues search
      }
      if (filtered.length > 0) {
        // Only return the actions matching the prompt — don't add extra actions
        // that would overwrite the primary data in the snapshot
        return filtered;
      }
    }

    return allActions;
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
    // Primary action: search spreadsheets (zero params, works as discovery)
    // Note: Assemblr "google" maps to Composio "googlesheets" app — only Sheets actions available
    const allActions: ActionSpec[] = [
      {
        id: "google.searchSpreadsheets",
        name: "Search spreadsheets",
        description: "Search Google Sheets spreadsheets",
        type: "READ",
        integrationId: "google",
        capabilityId: "google_drive_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "google.getSpreadsheetData",
        name: "Get spreadsheet data",
        description: "Get data from a Google Sheets spreadsheet",
        type: "READ",
        integrationId: "google",
        capabilityId: "google_sheets_get",
        inputSchema: buildDefaultInputForCapability("google_sheets_get"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      if (/\bdata\b|\brows?\b|\bcells?\b|\bvalues?\b/.test(p)) {
        return [allActions[1]]; // get spreadsheet data
      }
    }

    // Default: search spreadsheets (zero params)
    return [allActions[0]];
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
  if (integration === "notion") {
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
  if (integration === "trello") {
    return [
      {
        id: "trello.listBoards",
        name: "List boards",
        description: "List Trello boards for the authenticated user",
        type: "READ",
        integrationId: "trello",
        capabilityId: "trello_boards_list",
        inputSchema: { idMember: "me" },
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "trello.listCards",
        name: "List cards",
        description: "List Trello cards from a board",
        type: "READ",
        integrationId: "trello",
        capabilityId: "trello_cards_list",
        inputSchema: buildDefaultInputForCapability("trello_cards_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "airtable") {
    return [
      {
        id: "airtable.listBases",
        name: "List bases",
        description: "List Airtable bases",
        type: "READ",
        integrationId: "airtable",
        capabilityId: "airtable_bases_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
    ];
  }
  if (integration === "intercom") {
    const lower = (prompt ?? "").toLowerCase();
    const wantsCompanies = /compan(y|ies)/i.test(lower);
    const wantsContacts = /contacts?/i.test(lower);
    const actions: any[] = [];

    if (!wantsCompanies && !wantsContacts) {
      // Default: conversations
      actions.push({
        id: "intercom.listConversations",
        name: "List conversations",
        description: "List Intercom conversations",
        type: "READ",
        integrationId: "intercom",
        capabilityId: "intercom_conversations_list",
        inputSchema: buildDefaultInputForCapability("intercom_conversations_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      });
    }
    if (wantsCompanies) {
      actions.push({
        id: "intercom.listCompanies",
        name: "List companies",
        description: "List Intercom companies",
        type: "READ",
        integrationId: "intercom",
        capabilityId: "intercom_companies_list",
        inputSchema: buildDefaultInputForCapability("intercom_companies_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      });
    }
    if (wantsContacts) {
      actions.push({
        id: "intercom.listContacts",
        name: "List contacts",
        description: "List Intercom contacts",
        type: "READ",
        integrationId: "intercom",
        capabilityId: "intercom_contacts_list",
        inputSchema: buildDefaultInputForCapability("intercom_contacts_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      });
    }
    if (actions.length === 0) {
      actions.push({
        id: "intercom.listConversations",
        name: "List conversations",
        description: "List Intercom conversations",
        type: "READ",
        integrationId: "intercom",
        capabilityId: "intercom_conversations_list",
        inputSchema: buildDefaultInputForCapability("intercom_conversations_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      });
    }
    return actions;
  }
  if (integration === "zoom") {
    return [
      {
        id: "zoom.listMeetings",
        name: "List meetings",
        description: "List Zoom meetings",
        type: "READ",
        integrationId: "zoom",
        capabilityId: "zoom_meetings_list",
        inputSchema: { userId: "me", type: "upcoming" },
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
    ];
  }
  if (integration === "gitlab") {
    const allActions: ActionSpec[] = [
      {
        id: "gitlab.listProjects",
        name: "List projects",
        description: "List GitLab projects",
        type: "READ",
        integrationId: "gitlab",
        capabilityId: "gitlab_projects_list",
        inputSchema: buildDefaultInputForCapability("gitlab_projects_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "gitlab.listMergeRequests",
        name: "List merge requests",
        description: "List GitLab merge requests",
        type: "READ",
        integrationId: "gitlab",
        capabilityId: "gitlab_merge_requests_list",
        inputSchema: buildDefaultInputForCapability("gitlab_merge_requests_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "gitlab.listCommits",
        name: "List commits",
        description: "List GitLab commits",
        type: "READ",
        integrationId: "gitlab",
        capabilityId: "gitlab_commits_list",
        inputSchema: buildDefaultInputForCapability("gitlab_commits_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\bcommits?\b|\bcommitted\b|\bpush(es|ed)?\b/.test(p)) {
        filtered.push(allActions[2]); // commits
      }
      if (/\bmerge\s*requests?\b|\bMRs?\b/.test(p)) {
        filtered.push(allActions[1]); // merge requests
      }
      if (/\bprojects?\b|\brepos?\b/.test(p)) {
        filtered.push(allActions[0]); // projects
      }
      if (filtered.length > 0) return filtered;
    }

    return allActions;
  }
  if (integration === "bitbucket") {
    // Discovery action first — zero params, returns all workspaces
    const allActions: ActionSpec[] = [
      {
        id: "bitbucket.listWorkspaces",
        name: "List workspaces",
        description: "List Bitbucket workspaces for the authenticated user",
        type: "READ",
        integrationId: "bitbucket",
        capabilityId: "bitbucket_workspaces_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "bitbucket.listRepos",
        name: "List repositories",
        description: "List Bitbucket repositories in a workspace",
        type: "READ",
        integrationId: "bitbucket",
        capabilityId: "bitbucket_repos_list",
        inputSchema: buildDefaultInputForCapability("bitbucket_repos_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "bitbucket.listPullRequests",
        name: "List pull requests",
        description: "List Bitbucket pull requests",
        type: "READ",
        integrationId: "bitbucket",
        capabilityId: "bitbucket_pull_requests_list",
        inputSchema: buildDefaultInputForCapability("bitbucket_pull_requests_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\brepos?\b|\brepositories?\b/.test(p)) {
        filtered.push(allActions[1]); // repos
      }
      if (/\bpull\s*requests?\b|\bPRs?\b/.test(p)) {
        filtered.push(allActions[2]); // pull requests
      }
      if (/\bworkspaces?\b/.test(p)) {
        filtered.push(allActions[0]); // workspaces
      }
      if (filtered.length > 0) return filtered;
    }

    // Default: return discovery action (workspaces) so it works with zero params
    return [allActions[0]];
  }
  if (integration === "asana") {
    // Discovery action first — zero params, returns all workspaces
    const allActions: ActionSpec[] = [
      {
        id: "asana.listWorkspaces",
        name: "List workspaces",
        description: "List Asana workspaces for the authenticated user",
        type: "READ",
        integrationId: "asana",
        capabilityId: "asana_workspaces_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "asana.listTasks",
        name: "List tasks",
        description: "List Asana tasks from a project",
        type: "READ",
        integrationId: "asana",
        capabilityId: "asana_tasks_list",
        inputSchema: buildDefaultInputForCapability("asana_tasks_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "asana.listProjects",
        name: "List projects",
        description: "List Asana projects in a workspace",
        type: "READ",
        integrationId: "asana",
        capabilityId: "asana_workspace_projects_list",
        inputSchema: buildDefaultInputForCapability("asana_workspace_projects_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\btasks?\b/.test(p)) {
        // Always include workspaces first (zero params) as a reliable fallback
        filtered.push(allActions[0]); // workspaces
        filtered.push(allActions[1]); // tasks
      }
      if (/\bprojects?\b/.test(p)) {
        if (!filtered.some((a) => a.id === allActions[0].id)) filtered.push(allActions[0]); // workspaces
        filtered.push(allActions[2]); // projects
      }
      if (/\bworkspaces?\b/.test(p)) {
        if (!filtered.some((a) => a.id === allActions[0].id)) filtered.push(allActions[0]); // workspaces
      }
      if (filtered.length > 0) return filtered;
    }

    // Default: return discovery action (workspaces) so it works with zero params
    return [allActions[0]];
  }
  if (integration === "microsoft_teams") {
    // Discovery action first — zero params, returns all teams
    const allActions: ActionSpec[] = [
      {
        id: "teams.listTeams",
        name: "List teams",
        description: "List Microsoft Teams for the organization",
        type: "READ",
        integrationId: "microsoft_teams",
        capabilityId: "teams_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "teams.listChannels",
        name: "List channels",
        description: "List Microsoft Teams channels",
        type: "READ",
        integrationId: "microsoft_teams",
        capabilityId: "teams_channels_list",
        inputSchema: buildDefaultInputForCapability("teams_channels_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "teams.listMessages",
        name: "List messages",
        description: "List Microsoft Teams messages",
        type: "READ",
        integrationId: "microsoft_teams",
        capabilityId: "teams_messages_list",
        inputSchema: buildDefaultInputForCapability("teams_messages_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\bmessages?\b|\bchat\b/.test(p)) {
        filtered.push(allActions[2]); // messages
      }
      if (/\bchannels?\b/.test(p)) {
        filtered.push(allActions[1]); // channels
      }
      if (/\bteams?\b/.test(p)) {
        filtered.push(allActions[0]); // joined teams
      }
      if (filtered.length > 0) return filtered;
    }

    // Default: return discovery action (joined teams) so it works with zero params
    return [allActions[0]];
  }
  if (integration === "outlook") {
    return [
      {
        id: "outlook.listMessages",
        name: "List messages",
        description: "List Outlook email messages",
        type: "READ",
        integrationId: "outlook",
        capabilityId: "outlook_messages_list",
        inputSchema: buildDefaultInputForCapability("outlook_messages_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "outlook.listEvents",
        name: "List events",
        description: "List Outlook calendar events",
        type: "READ",
        integrationId: "outlook",
        capabilityId: "outlook_events_list",
        inputSchema: buildDefaultInputForCapability("outlook_events_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "stripe") {
    const allActions: ActionSpec[] = [
      {
        id: "stripe.listCharges",
        name: "List charges",
        description: "List Stripe charges",
        type: "READ",
        integrationId: "stripe",
        capabilityId: "stripe_charges_list",
        inputSchema: buildDefaultInputForCapability("stripe_charges_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "stripe.listCustomers",
        name: "List customers",
        description: "List Stripe customers",
        type: "READ",
        integrationId: "stripe",
        capabilityId: "stripe_customers_list",
        inputSchema: buildDefaultInputForCapability("stripe_customers_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "stripe.listSubscriptions",
        name: "List subscriptions",
        description: "List Stripe subscriptions",
        type: "READ",
        integrationId: "stripe",
        capabilityId: "stripe_subscriptions_list",
        inputSchema: buildDefaultInputForCapability("stripe_subscriptions_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "stripe.listInvoices",
        name: "List invoices",
        description: "List Stripe invoices",
        type: "READ",
        integrationId: "stripe",
        capabilityId: "stripe_invoices_list",
        inputSchema: buildDefaultInputForCapability("stripe_invoices_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\bcharges?\b|\bpayments?\b/.test(p)) {
        filtered.push(allActions[0]); // charges
      }
      if (/\bcustomers?\b/.test(p)) {
        filtered.push(allActions[1]); // customers
      }
      if (/\bsubscriptions?\b/.test(p)) {
        filtered.push(allActions[2]); // subscriptions
      }
      if (/\binvoices?\b|\bbilling\b/.test(p)) {
        filtered.push(allActions[3]); // invoices
      }
      if (filtered.length > 0) return filtered;
    }

    return allActions;
  }
  if (integration === "hubspot") {
    const allActions: ActionSpec[] = [
      {
        id: "hubspot.listContacts",
        name: "List contacts",
        description: "List HubSpot contacts",
        type: "READ",
        integrationId: "hubspot",
        capabilityId: "hubspot_contacts_list",
        inputSchema: buildDefaultInputForCapability("hubspot_contacts_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "hubspot.listDeals",
        name: "List deals",
        description: "List HubSpot deals",
        type: "READ",
        integrationId: "hubspot",
        capabilityId: "hubspot_deals_list",
        inputSchema: buildDefaultInputForCapability("hubspot_deals_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "hubspot.listCompanies",
        name: "List companies",
        description: "List HubSpot companies",
        type: "READ",
        integrationId: "hubspot",
        capabilityId: "hubspot_companies_list",
        inputSchema: buildDefaultInputForCapability("hubspot_companies_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\bcontacts?\b/.test(p)) {
        filtered.push(allActions[0]); // contacts
      }
      if (/\bdeals?\b|\bpipeline\b|\bsales\b/.test(p)) {
        filtered.push(allActions[1]); // deals
      }
      if (/\bcompan(y|ies)\b|\baccounts?\b/.test(p)) {
        filtered.push(allActions[2]); // companies
      }
      if (filtered.length > 0) return filtered;
    }

    return allActions;
  }
  if (integration === "discord") {
    return [
      {
        id: "discord.listGuilds",
        name: "List guilds",
        description: "List Discord guilds",
        type: "READ",
        integrationId: "discord",
        capabilityId: "discord_guilds_list",
        inputSchema: buildDefaultInputForCapability("discord_guilds_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "clickup") {
    // Discovery action first — zero params, returns all teams/workspaces
    const allActions: ActionSpec[] = [
      {
        id: "clickup.listTeams",
        name: "List teams",
        description: "List ClickUp teams/workspaces for the authenticated user",
        type: "READ",
        integrationId: "clickup",
        capabilityId: "clickup_teams_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "high",
      },
      {
        id: "clickup.listSpaces",
        name: "List spaces",
        description: "List ClickUp spaces in a team",
        type: "READ",
        integrationId: "clickup",
        capabilityId: "clickup_spaces_list",
        inputSchema: buildDefaultInputForCapability("clickup_spaces_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "clickup.listTasks",
        name: "List tasks",
        description: "List ClickUp tasks in a list",
        type: "READ",
        integrationId: "clickup",
        capabilityId: "clickup_tasks_list",
        inputSchema: buildDefaultInputForCapability("clickup_tasks_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: ActionSpec[] = [];
      if (/\btasks?\b/.test(p)) {
        filtered.push(allActions[2]); // tasks
      }
      if (/\bspaces?\b/.test(p)) {
        filtered.push(allActions[1]); // spaces
      }
      if (/\bteams?\b|\bworkspaces?\b/.test(p)) {
        filtered.push(allActions[0]); // teams
      }
      if (filtered.length > 0) return filtered;
    }

    // Default: return discovery action (teams) so it works with zero params
    return [allActions[0]];
  }
  if (integration === "quickbooks") {
    return [
      {
        id: "quickbooks.queryAccounts",
        name: "Query accounts",
        description: "Query QuickBooks accounts",
        type: "READ",
        integrationId: "quickbooks",
        capabilityId: "quickbooks_accounts_query",
        inputSchema: buildDefaultInputForCapability("quickbooks_accounts_query"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "quickbooks.readCustomer",
        name: "Read customer",
        description: "Read QuickBooks customer data",
        type: "READ",
        integrationId: "quickbooks",
        capabilityId: "quickbooks_customers_read",
        inputSchema: buildDefaultInputForCapability("quickbooks_customers_read"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "quickbooks.balanceDetail",
        name: "Customer balance detail",
        description: "Get QuickBooks customer balance detail report",
        type: "READ",
        integrationId: "quickbooks",
        capabilityId: "quickbooks_balance_detail",
        inputSchema: buildDefaultInputForCapability("quickbooks_balance_detail"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "google_analytics") {
    return [
      {
        id: "googleAnalytics.listAccounts",
        name: "List accounts",
        description: "List Google Analytics accounts",
        type: "READ",
        integrationId: "google_analytics",
        capabilityId: "google_analytics_reports_run",
        inputSchema: buildDefaultInputForCapability("google_analytics_reports_run"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
      {
        id: "googleAnalytics.listAudiences",
        name: "List audiences",
        description: "List Google Analytics audiences",
        type: "READ",
        integrationId: "google_analytics",
        capabilityId: "google_analytics_audiences_list",
        inputSchema: buildDefaultInputForCapability("google_analytics_audiences_list"),
        outputSchema: {},
        writesToState: false,
        confidenceLevel: "medium",
      },
    ];
  }
  // Default fallback for any unhandled integration
  return [
    {
      id: `${integration}.list`,
      name: "List data",
      description: `List ${integration} data`,
      type: "READ",
      integrationId: integration,
      capabilityId: `${integration}_list`,
      inputSchema: {},
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

function buildFallbackEntitiesForIntegration(integration: IntegrationId, prompt?: string): EntitySpec[] {
  if (integration === "github") {
    const allEntities: EntitySpec[] = [
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
      {
        name: "Commit",
        sourceIntegration: "github",
        relations: [],
        identifiers: ["sha"],
        supportedActions: ["github.commits.list"],
        fields: [
          { name: "sha", type: "string", required: true },
          { name: "message", type: "string" },
          { name: "author", type: "string" },
          { name: "date", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];

    // If we have a prompt, filter to only relevant entities
    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: EntitySpec[] = [];
      if (/\bcommits?\b|\bcommitted\b|\bpush(es|ed)?\b|\bchanges?\b/.test(p)) {
        filtered.push(allEntities[3]); // Commit
      }
      if (/\bissues?\b|\bbugs?\b|\btickets?\b/.test(p)) {
        filtered.push(allEntities[0]); // Issue
      }
      if (/\brepos?\b|\brepositories?\b/.test(p)) {
        filtered.push(allEntities[2]); // Repository
      }
      if (/\bpull\s*requests?\b|\bPRs?\b|\bmerge\b/.test(p)) {
        filtered.push(allEntities[1]); // PullRequest
      }
      if (filtered.length > 0) return filtered;
    }

    return allEntities;
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
  if (integration === "trello") {
    return [
      {
        name: "Board",
        sourceIntegration: "trello",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["trello.boards.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "description", type: "string" },
          { name: "url", type: "string" },
          { name: "dateLastActivity", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Card",
        sourceIntegration: "trello",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["trello.cards.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "description", type: "string" },
          { name: "due", type: "string" },
          { name: "labels", type: "string" },
          { name: "listName", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "airtable") {
    return [
      {
        name: "Base",
        sourceIntegration: "airtable",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["airtable.bases.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "permissionLevel", type: "string" },
        ],
        confidenceLevel: "high",
      },
    ];
  }
  if (integration === "intercom") {
    return [
      {
        name: "Conversation",
        sourceIntegration: "intercom",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["intercom.conversations.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "title", type: "string" },
          { name: "state", type: "string" },
          { name: "createdAt", type: "string" },
          { name: "updatedAt", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Contact",
        sourceIntegration: "intercom",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["intercom.contacts.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "email", type: "string" },
          { name: "role", type: "string" },
          { name: "createdAt", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "zoom") {
    return [
      {
        name: "Meeting",
        sourceIntegration: "zoom",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["zoom.meetings.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "topic", type: "string" },
          { name: "startTime", type: "string" },
          { name: "duration", type: "number" },
          { name: "status", type: "string" },
          { name: "joinUrl", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "gitlab") {
    const allEntities: EntitySpec[] = [
      {
        name: "Project",
        sourceIntegration: "gitlab",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["gitlab.projects.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "description", type: "string" },
          { name: "webUrl", type: "string" },
          { name: "lastActivityAt", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "MergeRequest",
        sourceIntegration: "gitlab",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["gitlab.mergeRequests.list"],
        fields: [
          { name: "title", type: "string", required: true },
          { name: "state", type: "string" },
          { name: "author", type: "string" },
          { name: "createdAt", type: "string" },
          { name: "targetBranch", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Commit",
        sourceIntegration: "gitlab",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["gitlab.commits.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "message", type: "string" },
          { name: "authorName", type: "string" },
          { name: "createdAt", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: EntitySpec[] = [];
      if (/\bcommits?\b|\bcommitted\b|\bpush(es|ed)?\b/.test(p)) {
        filtered.push(allEntities[2]); // Commit
      }
      if (/\bmerge\s*requests?\b|\bMRs?\b/.test(p)) {
        filtered.push(allEntities[1]); // MergeRequest
      }
      if (/\bprojects?\b|\brepos?\b/.test(p)) {
        filtered.push(allEntities[0]); // Project
      }
      if (filtered.length > 0) return filtered;
    }

    return allEntities;
  }
  if (integration === "bitbucket") {
    return [
      {
        name: "Repository",
        sourceIntegration: "bitbucket",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["bitbucket.repos.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "fullName", type: "string" },
          { name: "description", type: "string" },
          { name: "language", type: "string" },
          { name: "updatedOn", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "PullRequest",
        sourceIntegration: "bitbucket",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["bitbucket.pullRequests.list"],
        fields: [
          { name: "title", type: "string", required: true },
          { name: "state", type: "string" },
          { name: "author", type: "string" },
          { name: "createdOn", type: "string" },
          { name: "destination", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "asana") {
    return [
      {
        name: "Task",
        sourceIntegration: "asana",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["asana.tasks.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "assignee", type: "string" },
          { name: "dueOn", type: "string" },
          { name: "completed", type: "boolean" },
          { name: "section", type: "string" },
          { name: "projects", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "microsoft_teams") {
    return [
      {
        name: "Message",
        sourceIntegration: "microsoft_teams",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["teams.messages.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "body", type: "string" },
          { name: "from", type: "string" },
          { name: "createdDateTime", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Channel",
        sourceIntegration: "microsoft_teams",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["teams.channels.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "displayName", type: "string" },
          { name: "description", type: "string" },
          { name: "membershipType", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "outlook") {
    return [
      {
        name: "Email",
        sourceIntegration: "outlook",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["outlook.messages.list"],
        fields: [
          { name: "subject", type: "string", required: true },
          { name: "from", type: "string" },
          { name: "receivedDateTime", type: "string" },
          { name: "bodyPreview", type: "string" },
          { name: "isRead", type: "boolean" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Event",
        sourceIntegration: "outlook",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["outlook.events.list"],
        fields: [
          { name: "subject", type: "string", required: true },
          { name: "start", type: "string" },
          { name: "end", type: "string" },
          { name: "location", type: "string" },
          { name: "organizer", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "stripe") {
    const allEntities: EntitySpec[] = [
      {
        name: "Charge",
        sourceIntegration: "stripe",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["stripe.charges.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "amount", type: "number" },
          { name: "currency", type: "string" },
          { name: "status", type: "string" },
          { name: "created", type: "string" },
          { name: "description", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Customer",
        sourceIntegration: "stripe",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["stripe.customers.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "email", type: "string" },
          { name: "created", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Subscription",
        sourceIntegration: "stripe",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["stripe.subscriptions.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "status", type: "string" },
          { name: "currentPeriodEnd", type: "string" },
          { name: "plan", type: "string" },
          { name: "customer", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Invoice",
        sourceIntegration: "stripe",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["stripe.invoices.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "amountDue", type: "number" },
          { name: "status", type: "string" },
          { name: "dueDate", type: "string" },
          { name: "customer", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: EntitySpec[] = [];
      if (/\bcharges?\b|\bpayments?\b/.test(p)) {
        filtered.push(allEntities[0]); // Charge
      }
      if (/\bcustomers?\b/.test(p)) {
        filtered.push(allEntities[1]); // Customer
      }
      if (/\bsubscriptions?\b/.test(p)) {
        filtered.push(allEntities[2]); // Subscription
      }
      if (/\binvoices?\b|\bbilling\b/.test(p)) {
        filtered.push(allEntities[3]); // Invoice
      }
      if (filtered.length > 0) return filtered;
    }

    return allEntities;
  }
  if (integration === "hubspot") {
    const allEntities: EntitySpec[] = [
      {
        name: "Contact",
        sourceIntegration: "hubspot",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["hubspot.contacts.list"],
        fields: [
          { name: "firstname", type: "string", required: true },
          { name: "lastname", type: "string" },
          { name: "email", type: "string" },
          { name: "phone", type: "string" },
          { name: "createdate", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Deal",
        sourceIntegration: "hubspot",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["hubspot.deals.list"],
        fields: [
          { name: "dealname", type: "string", required: true },
          { name: "amount", type: "number" },
          { name: "dealstage", type: "string" },
          { name: "closedate", type: "string" },
          { name: "pipeline", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Company",
        sourceIntegration: "hubspot",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["hubspot.companies.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "domain", type: "string" },
          { name: "industry", type: "string" },
          { name: "annualrevenue", type: "number" },
          { name: "createdate", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];

    if (prompt) {
      const p = prompt.toLowerCase();
      const filtered: EntitySpec[] = [];
      if (/\bcontacts?\b/.test(p)) {
        filtered.push(allEntities[0]); // Contact
      }
      if (/\bdeals?\b|\bpipeline\b|\bsales\b/.test(p)) {
        filtered.push(allEntities[1]); // Deal
      }
      if (/\bcompan(y|ies)\b|\baccounts?\b/.test(p)) {
        filtered.push(allEntities[2]); // Company
      }
      if (filtered.length > 0) return filtered;
    }

    return allEntities;
  }
  if (integration === "discord") {
    return [
      {
        name: "Guild",
        sourceIntegration: "discord",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["discord.guilds.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "icon", type: "string" },
          { name: "memberCount", type: "number" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "clickup") {
    return [
      {
        name: "Task",
        sourceIntegration: "clickup",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["clickup.tasks.list"],
        fields: [
          { name: "name", type: "string", required: true },
          { name: "status", type: "string" },
          { name: "assignees", type: "string" },
          { name: "dueDate", type: "string" },
          { name: "priority", type: "string" },
          { name: "list", type: "string" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Space",
        sourceIntegration: "clickup",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["clickup.spaces.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "private", type: "boolean" },
          { name: "statuses", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "quickbooks") {
    return [
      {
        name: "Account",
        sourceIntegration: "quickbooks",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["quickbooks.queryAccounts"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "accountType", type: "string" },
          { name: "currentBalance", type: "number" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Customer",
        sourceIntegration: "quickbooks",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["quickbooks.readCustomer"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "displayName", type: "string" },
          { name: "companyName", type: "string" },
          { name: "balance", type: "number" },
        ],
        confidenceLevel: "medium",
      },
      {
        name: "Balance",
        sourceIntegration: "quickbooks",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["quickbooks.balanceDetail"],
        fields: [
          { name: "customerName", type: "string", required: true },
          { name: "balance", type: "number" },
          { name: "dueDate", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  if (integration === "google_analytics") {
    return [
      {
        name: "Account",
        sourceIntegration: "google_analytics",
        relations: [],
        identifiers: ["id"],
        supportedActions: ["googleAnalytics.accounts.list"],
        fields: [
          { name: "id", type: "string", required: true },
          { name: "name", type: "string" },
          { name: "createTime", type: "string" },
          { name: "updateTime", type: "string" },
        ],
        confidenceLevel: "medium",
      },
    ];
  }
  // Default fallback for google (email)
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
    if (lower === "commit") return "commits";
    if (lower === "board") return "boards";
    if (lower === "card") return "cards";
    if (lower === "record") return "records";
    if (lower === "conversation") return "conversations";
    if (lower === "contact") return "contacts";
    if (lower === "meeting") return "meetings";
    if (lower === "project") return "projects";
    if (lower === "mergerequest") return "mergerequests";
    if (lower === "task") return "tasks";
    if (lower === "space") return "spaces";
    if (lower === "event") return "events";
    if (lower === "charge") return "charges";
    if (lower === "customer") return "customers";
    if (lower === "subscription") return "subscriptions";
    if (lower === "invoice") return "invoices";
    if (lower === "deal") return "deals";
    if (lower === "company") return "companies";
    if (lower === "guild") return "guilds";
    if (lower === "account") return "accounts";
    if (lower === "balance") return "balances";
    if (lower === "audience") return "audiences";
    if (lower === "recording") return "recordings";
    if (lower === "pipeline") return "pipelines";
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
  // Legacy support removal
  return {};
}
