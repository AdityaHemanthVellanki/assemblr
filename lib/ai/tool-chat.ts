// import "server-only";

import { createHash, randomUUID } from "crypto";
import { getServerEnv } from "@/lib/env";
import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { ToolSystemSpecSchema, ToolSystemSpec, IntegrationId, StateReducer, isToolSystemSpec, AnswerContractSchema, GoalPlanSchema, IntentContractSchema, SemanticPlanSchema, TOOL_SPEC_VERSION, type AnswerContract, type GoalPlan, type IntegrationQueryPlan, type ToolGraph, type ViewSpecPayload, type IntentContract, type SemanticPlan, type IntegrationStatus } from "@/lib/toolos/spec";
import { normalizeToolSpec } from "@/lib/spec/toolSpec";
import { getCapabilitiesForIntegration, getCapability } from "@/lib/capabilities/registry";
import { getIntegrationTokenStatus } from "@/lib/integrations/tokenRefresh";
import { buildCompiledToolArtifact, validateToolSystem, CompiledToolArtifact } from "@/lib/toolos/compiler";
import { ToolCompiler } from "@/lib/toolos/compiler/tool-compiler";
import { saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { ToolBuildStateMachine } from "@/lib/toolos/build-state-machine";
import type { DataEvidence } from "@/lib/toolos/data-evidence";
import { createToolVersion, promoteToolVersion } from "@/lib/toolos/versioning";
import { consumeToolBudget, BudgetExceededError } from "@/lib/security/tool-budget";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withToolBuildLock } from "@/lib/toolos/build-lock";
import { resolveBuildContext } from "@/lib/toolos/build-context";
import { executeToolAction } from "@/lib/toolos/runtime";
import { IntegrationAuthError } from "@/lib/integrations/tokenRefresh";
import { inferFieldsFromData } from "@/lib/toolos/schema/infer";
import { materializeToolOutput, finalizeToolEnvironment, buildSnapshotRecords, countSnapshotRecords } from "@/lib/toolos/materialization";
import { validateFetchedData } from "@/lib/toolos/answer-contract";
import { evaluateGoalSatisfaction, decideRendering, buildEvidenceFromDerivedIncidents, evaluateRelevanceGate, type GoalEvidence, type RelevanceGateResult } from "@/lib/toolos/goal-validation";
import { PROJECT_STATUSES } from "@/lib/core/constants";
import { acquireExecutionLock, completeExecution, getExecutionById, updateExecution } from "@/lib/toolos/executions";
import { canExecuteTool, ensureToolIdentity, finalizeToolExecution } from "@/lib/toolos/lifecycle";

import { IntegrationNotConnectedError, isIntegrationNotConnectedError } from "@/lib/errors/integration-errors";
import { runCheckIntegrationReadiness } from "@/lib/toolos/compiler/stages/check-integration-readiness";

export interface ToolChatRequest {
  orgId: string;
  toolId: string;
  userId?: string | null;
  currentSpec?: unknown;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
  mode: "create" | "modify" | "chat" | "runtime";
  integrationMode?: "auto" | "manual";
  selectedIntegrationIds?: string[];
  requiredIntegrationIds?: string[];
  executionId?: string;
  supabaseClient?: any;
}

export interface ToolChatResponse {
  explanation: string;
  message: { type: "text"; content: string };
  spec?: unknown;
  metadata?: Record<string, any>;
  requiresIntegrations?: boolean;
  missingIntegrations?: string[];
  requiredIntegrations?: string[];
}

type BuildStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "success" | "error";
  logs: string[];
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
  "name": string,
  "purpose": string,
  "entities": [{ "name": string, "fields": [{ "name": string, "type": string, "required": boolean? }], "sourceIntegration": "google" | "slack" | "github" | "linear" | "notion", "identifiers": string[], "supportedActions": string[], "relations"?: [{ "name": string, "target": string, "type": "one_to_one" | "one_to_many" | "many_to_many" }], "behaviors": string[]? }],
  "actionGraph": { "nodes": [{ "id": string, "actionId": string, "stepLabel"?: string }], "edges": [{ "from": string, "to": string, "condition"?: string, "type": "default" | "success" | "failure" }] },
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
  "memory": { "tool": { "namespace": string, "retentionDays": number, "schema": object }, "user": { "namespace": string, "retentionDays": number, "schema": object } },
  "automations": { "enabled": boolean, "capabilities": { "canRunWithoutUI": boolean, "supportedTriggers": string[], "maxFrequency": number, "safetyConstraints": string[] }, "lastRunAt"?: string, "nextRunAt"?: string },
  "observability": { "executionTimeline": boolean, "recentRuns": boolean, "errorStates": boolean, "integrationHealth": boolean, "manualRetryControls": boolean }
}
Do not include any additional keys. Output JSON only.
All requested integrations must appear in integrations and be used by entities and actions.
Views must only reference state keys and actions.

CRITICAL RULES:
1. NEVER output "undefined" for any field.
2. Use empty arrays [] for missing lists (e.g. entities, actions, workflows).
3. Use empty objects {} for missing maps (e.g. initial state).
4. All IDs must be unique strings.
5. "name" and "purpose" are REQUIRED.

Valid capabilities by provider:
${capabilityCatalog}
`;

const TIME_BUDGETS = {
  intentMs: 500,
  readinessMs: 1000,
  initialFetchMs: 2000,
  firstRenderMs: 3000,
};

const DEFAULT_CHAT_TITLES = new Set(
  ["new chat", "new tool", "untitled", "untitled project", "untitled chat", "new chat", "new tool", "new tool chat"]
    .map((value) => value.trim().toLowerCase()),
);

function normalizeChatTitle(value: string) {
  return value.trim().toLowerCase();
}

export function isDefaultChatTitle(value?: string | null) {
  if (!value) return true;
  return DEFAULT_CHAT_TITLES.has(normalizeChatTitle(value));
}

function titleCase(input: string) {
  return input
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.toUpperCase() === word && word.length <= 6) return word;
      const lower = word.toLowerCase();
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

export async function generateChatTitle(params: {
  firstUserMessage: string;
  intent?: string;
  goal?: string;
}) {
  const message = params.firstUserMessage.trim();
  if (!message) return null;
  const env = getServerEnv();
  if (!env.AZURE_OPENAI_DEPLOYMENT_NAME) return null;
  const systemPrompt =
    "Generate a short, clear, human-readable title (3–7 words) that summarizes the user’s intent. Do not include verbs like build, create, show. Do not include punctuation. Return only the title.";
  const intentLine = params.intent ? `Intent: ${params.intent}` : "";
  const goalLine = params.goal ? `Goal: ${params.goal}` : "";
  const userContent = [message, intentLine, goalLine].filter(Boolean).join("\n");
  let raw = "";
  try {
    const response = await getAzureOpenAIClient().chat.completions.create({
      model: env.AZURE_OPENAI_DEPLOYMENT_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 24,
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch {
    return null;
  }
  let title = raw.replace(/[\r\n]+/g, " ").trim();
  if (title.startsWith('"') && title.endsWith('"')) {
    title = title.slice(1, -1).trim();
  }
  title = title.replace(/[.?!,:;'"`]/g, "").replace(/\s+/g, " ").trim();
  if (!title) return null;
  let words = title.split(" ").filter(Boolean);
  if (words.length < 3) {
    if (words.length === 1) {
      words = ["Recent", words[0], "Overview"];
    } else {
      words = ["Recent", ...words];
    }
  }
  if (words.length > 7) {
    words = words.slice(0, 7);
  }
  return titleCase(words.join(" "));
}

export async function maybeAutoRenameChat(params: {
  supabase: any;
  toolId: string;
  orgId: string;
  firstUserMessage: string;
  intent?: string;
  goal?: string;
}) {
  const { data: project } = await (params.supabase.from("projects") as any)
    .select("name")
    .eq("id", params.toolId)
    .eq("org_id", params.orgId)
    .single();
  if (!project || !isDefaultChatTitle(project.name)) return null;

  const { count } = await (params.supabase.from("chat_messages") as any)
    .select("id", { count: "exact", head: true })
    .eq("tool_id", params.toolId)
    .eq("role", "user");
  if (count !== 1) return null;

  const title = await generateChatTitle({
    firstUserMessage: params.firstUserMessage,
    intent: params.intent,
    goal: params.goal,
  });
  if (!title || isDefaultChatTitle(title)) return null;

  const { error } = await (params.supabase.from("projects") as any)
    .update({ name: title, updated_at: new Date().toISOString() })
    .eq("id", params.toolId)
    .eq("org_id", params.orgId);
  if (error) return null;

  return title;
}

async function createToolBuilderSystemPrompt(input: {
  orgId: string;
  toolId: string;
  currentSpec: unknown | null;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  capabilities: any[];
  context: any;
}) {
  return INTENT_SYSTEM_PROMPT;
}

export async function runToolRuntimePipeline(input: ToolChatRequest) {
  return await processToolChat({
    ...input,
    mode: "runtime",
  });
}

export async function processToolChat(
  input: ToolChatRequest,
): Promise<ToolChatResponse> {
  if (input.mode === "create") {
    return runCompilerPipeline(input);
  }
  return _executeToolRuntime(input);
}

async function _executeToolRuntime(
  input: ToolChatRequest,
): Promise<ToolChatResponse> {
  const supabase = createSupabaseAdminClient();
  
  // 1. Fetch Tool & Version
  const { data: project } = await (supabase.from("projects") as any)
    .select("spec, active_version_id, compiled_at")
    .eq("id", input.toolId)
    .single();

  if (!project) {
    throw new Error(`Tool ${input.toolId} not found`);
  }
  const canExecute = await canExecuteTool({ toolId: input.toolId });
  if (!canExecute.ok) {
    throw new Error(`Tool ${input.toolId} is not runnable (${canExecute.reason})`);
  }

  // 2. Resolve Artifacts (Spec + Compiled Tool)
  let spec = project.spec as ToolSystemSpec;
  let compiledTool: CompiledToolArtifact | null = null;

  if (project.active_version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec, compiled_tool")
      .eq("id", project.active_version_id)
      .single();
    
    if (version) {
      spec = version.tool_spec as ToolSystemSpec;
      compiledTool = version.compiled_tool as CompiledToolArtifact;
    }
  }

  // Fallback: Build artifact from spec if missing (Runtime compilation only, no LLM)
  if (!compiledTool) {
    // If spec is empty/invalid, we can't run.
    if (!spec || Object.keys(spec).length === 0) {
       throw new Error("Tool has no spec and no active version. Cannot execute.");
    }
    compiledTool = buildCompiledToolArtifact(spec);

    // FIX: Auto-Repair Invariant Violation
    // If we have a valid spec/compiled tool but no active version, create one now.
    // This ensures runtime always runs against a versioned tool.
    if (!project.active_version_id && input.userId) {
      console.warn(`[RuntimeRepair] Tool ${input.toolId} has no active version. Auto-repairing...`);
      try {
        const version = await createToolVersion({
            orgId: input.orgId,
            toolId: input.toolId,
            userId: input.userId,
            spec: spec,
            compiledTool: compiledTool,
            baseSpec: null,
            supabase: supabase,
        });
        await promoteToolVersion({ toolId: input.toolId, versionId: version.id, supabase });
        console.log(`[RuntimeRepair] Successfully created and promoted version ${version.id}`);
        
        // Update local reference if needed (though we already have spec/compiledTool)
      } catch (err) {
        console.error("[RuntimeRepair] Failed to auto-repair tool version:", err);
        // We continue execution because we have the artifacts, but log the failure.
        // Ideally we should probably block, but "limp forward" is what we want to avoid? 
        // User said: "Auto-repair OR Hard fail".
        // If repair fails, we should hard fail?
        // Let's hard fail if repair fails to strictly enforce invariant.
        throw new Error(`Fatal Invariant: Tool has no version and auto-repair failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 3. Delegate to Runtime Execution Logic
  // We use resumeToolExecution which handles the standard execution flow
  return resumeToolExecution({
    executionId: input.executionId!,
    orgId: input.orgId,
    toolId: input.toolId,
    userId: input.userId,
    prompt: input.userMessage,
    spec,
    compiledTool
  });
}

export async function runCompilerPipeline(
  input: ToolChatRequest,
): Promise<ToolChatResponse> {
  getServerEnv();

  // FIX: Execution Status Gate
  // If execution exists and is not "created", we must NOT run the compiler.
  // We route to runtime instead.
  if (input.executionId) {
    const execution = await getExecutionById(input.executionId);
    if (execution && execution.status !== "created") {
      const canExecute = await canExecuteTool({ toolId: input.toolId });
      if (!canExecute.ok) {
        throw new Error(
          `Fatal Invariant: Execution ${input.executionId} is '${execution.status}' but Tool ${input.toolId} is not runnable (${canExecute.reason}). Cannot redirect to runtime.`,
        );
      }

      console.log(`[CompilerGuard] Redirecting execution ${input.executionId} (status: ${execution.status}) to runtime`);
      return runToolRuntimePipeline(input);
    }
  }

  // Compiler pipeline requires create mode
  if (input.mode !== "create") {
    throw new Error("Compiler pipeline only supports create mode");
  }
  if (!input.userMessage) {
    throw new Error("Compiler invoked without prompt in create mode");
  }

  return await withToolBuildLock(input.toolId, async () => {
  const steps = createBuildSteps();
  const builderNamespace = "tool_builder";
  
  // 0. Resolve Context Securely
  const supabase = createSupabaseAdminClient();
  let statusSupabase: any = input.supabaseClient;
  if (!statusSupabase) {
    try {
      statusSupabase = await createSupabaseServerClient();
    } catch (err) {
      console.error("[FINALIZE CONTEXT] Server client unavailable, falling back to admin", err);
      statusSupabase = createSupabaseAdminClient();
    }
  }
  // We don't rely on getUser with input.userId because admin client can't verify session for arbitrary ID easily
  // Instead, we verify ownership via resolveBuildContext later.
  
  // FIX 1: Canonical Ownership Bootstrap
  // This guarantees user, org, and membership exist before we start any build
  if (!input.userId) {
    throw new Error("Compiler pipeline requires userId");
  }
  const buildContext = await resolveBuildContext(input.userId, input.orgId);
  const userId = buildContext.userId;
  
  // Assert orgId matches context if resolved differently?
  // resolveBuildContext might create a new org if input.orgId is missing/invalid?
  // No, resolveBuildContext takes orgId and ensures it exists or throws/creates default.
  // We should trust buildContext.orgId as authoritative.
  const orgId = buildContext.orgId;
  const existingExecution = input.executionId ? await getExecutionById(input.executionId) : null;

  const toolId = input.toolId;
  if (!toolId) {
    throw new Error("Compiler pipeline requires toolId");
  }

  const { toolId: ensuredToolId } = await ensureToolIdentity({
    supabase,
    toolId,
    orgId,
    userId,
    name: "New Tool",
    purpose: input.userMessage,
    sourcePrompt: input.userMessage,
  });

  const { data: existingTool } = await (supabase.from("projects") as any)
    .select("id, compiled_at, status, active_version_id")
    .eq("id", ensuredToolId)
    .single();

  // FIX: Only redirect to runtime if we have a valid ACTIVE VERSION.
  // Legacy "compiled_at" check is insufficient and caused the "ToolSpec metadata missing" bug.
  const canExecuteExisting = await canExecuteTool({ toolId: ensuredToolId });
  if (canExecuteExisting.ok) {
    return runToolRuntimePipeline(input);
  }

  // FIX 4: Tool State Guardrails
  // Prevent double compilation if tool is already in a post-creation state
  // Valid statuses: DRAFT, BUILDING, READY, FAILED
  // We allow compilation if DRAFT, BUILDING (retry), or FAILED (retry).
  // If status is READY but no active_version_id (handled above), we recompile.
  if (existingTool && existingTool.status !== "DRAFT" && existingTool.status !== "BUILDING" && existingTool.status !== "FAILED") {
      // If we are here, status is READY (or similar) but active_version_id is missing (checked above).
      // So we should actually ALLOW compilation to fix the broken state.
      // But if status is READY and we HAVE active_version_id, we caught it above.
      // So this block is redundant if we trust the first check?
      // Not quite. If status is "READY" and active_version_id is NULL, we fall through (Good).
      // If status is "ARCHIVED" (if that exists), we might want to compile?
      // Let's keep it safe: strict check.
      if (existingTool.active_version_id) {
         return runToolRuntimePipeline(input);
      }
      // If no active version, we proceed to compile (fixing the tool).
  }
    
  let effectiveToolId = ensuredToolId;
  
  if (!existingTool) {
     // FIX 1, 2, 3: Auto-create tool in DB if missing (Source of Truth)
     // This guarantees the compiler never runs on an ephemeral ID.
     const newToolId = toolId;
     
     const { data: newTool, error: createError } = await supabase
        .from("projects")
        .insert({
            id: newToolId,
            org_id: orgId,
            name: "New Tool", 
            status: "DRAFT", // Initial status
            spec: { actions: [] },
            compiled_at: null
        })
        .select("id")
        .single();
        
     if (createError || !newTool) {
         throw new Error(`Failed to create tool row: ${createError?.message}`);
     }

     const { data: verifyProject } = await (supabase.from("projects") as any)
       .select("id")
       .eq("id", newToolId)
       .single();

     const { data: verifyTool } = await (supabase.from("tools") as any)
       .select("id")
       .eq("id", newToolId)
       .single();

     if (!verifyProject) {
       throw new Error("Invariant violation: Tool created but not visible in 'projects' table.");
     }
     if (!verifyTool) {
       throw new Error("Invariant violation: Tool created but not visible in 'tools' table. This will cause FK violation.");
     }

     effectiveToolId = newTool.id;
  } else {
      effectiveToolId = existingTool.id;
  }
  
  // 1. Run Pipeline
  
  // FIX: Inject effectiveToolId into context
  const effectiveToolIdValue = effectiveToolId!;

  await (supabase.from("projects") as any).update({ status: "BUILDING" }).eq("id", effectiveToolIdValue);
  
  const systemPrompt = await createToolBuilderSystemPrompt({
    orgId: orgId, // Use authoritative ID
    toolId: effectiveToolIdValue,
    currentSpec: input.currentSpec || null,
    history: input.messages,
    capabilities: [], // Will be filled by discovery
    context: {
        connectedIntegrations: [],
        availableCapabilities: [],
        activeScopes: ["global", "org", "user"]
    }
  });

  const machine = new ToolBuildStateMachine();
  const buildId = randomUUID();
  const builderSessionId = `tool-builder:${input.toolId}:${input.userId ?? "anonymous"}`;
  const builderScope: MemoryScope = {
    type: "session",
    sessionId: builderSessionId,
  };
  // Use the authoritative orgId from buildContext
  const toolScope: MemoryScope = { type: "tool_org", toolId: input.toolId, orgId: buildContext.orgId };
  let lifecyclePersistenceFailed = false;
  let buildLogsPersistenceFailed = false;
  const persistLifecycle = async () => {
    if (!lifecyclePersistenceFailed) {
      try {
        await saveMemory({
          scope: toolScope,
          namespace: builderNamespace,
          key: "lifecycle_state",
          value: { state: machine.state, buildId },
        });
      } catch (err) {
        lifecyclePersistenceFailed = true;
        console.error("[LifecyclePersistenceFailed]", err);
        if (machine && typeof machine.transitionTo === "function") {
          machine.transitionTo("DEGRADED", "Lifecycle persistence failed", "error");
        }
      }
    }
    if (!buildLogsPersistenceFailed) {
      try {
        await saveMemory({
          scope: toolScope,
          namespace: builderNamespace,
          key: "build_logs",
          value: { buildId, logs: machine.logs },
        });
      } catch (err) {
        buildLogsPersistenceFailed = true;
        console.error("[BuildLogsPersistenceFailed]", err);
      }
    }
  };
  let lifecycleChain = Promise.resolve();
  const transition = async (
    next: Parameters<ToolBuildStateMachine["transition"]>[0],
    payload: Parameters<ToolBuildStateMachine["transition"]>[1],
    level?: Parameters<ToolBuildStateMachine["transition"]>[2],
  ) => {
    lifecycleChain = lifecycleChain.then(async () => {
      if (!machine || typeof machine.transitionTo !== "function") {
        throw new Error("Invalid lifecycle machine instance");
      }
      machine.transitionTo(next, payload, level);
      await persistLifecycle();
    });
    await lifecycleChain;
  };
  const prompt = input.userMessage;
  const assumptionResolution = resolveAssumptions(prompt);
  const resolvedPrompt = assumptionResolution.resolvedPrompt;
  const assumptions = assumptionResolution.assumptions;
  const completenessScore = assumptionResolution.completenessScore;
  const integrationRequirement = resolveIntegrationRequirements({
    prompt,
    integrationMode: input.integrationMode,
    selectedIntegrationIds: input.selectedIntegrationIds,
    requiredIntegrationIds: input.requiredIntegrationIds,
  });
  if (integrationRequirement.mismatchMessage) {
    if (input.executionId) {
      await updateExecution(input.executionId, { status: "failed" });
    }
    return {
      explanation: integrationRequirement.mismatchMessage,
      message: { type: "text", content: integrationRequirement.mismatchMessage },
      metadata: {
        blocked: true,
        integration_mode: input.integrationMode ?? "auto",
        executionId: input.executionId,
      },
    };
  }
  const requiredIntegrations = integrationRequirement.requiredIntegrations;

  const stepsById = new Map(steps.map((s) => [s.id, s]));
  let spec: ToolSystemSpec;
  const latestEvidence: Record<string, DataEvidence> = {};
  const activeVersionId: string | null = null;
  let runTokens = 0;
  const consumeTokens = async (usage?: { total_tokens?: number }) => {
    if (!usage?.total_tokens) return;
    runTokens += usage.total_tokens;
    await consumeToolBudget({
      orgId: input.orgId,
      toolId: input.toolId,
      tokens: usage.total_tokens,
      runTokens,
    });
  };

  try {
    await persistLifecycle();
    // NOTE: compiledTool must be declared exactly once.
    // Do not redeclare inside try/catch or branches.
    let compiledTool: CompiledToolArtifact | null = null;
    if (input.executionId) {
      try {
        await acquireExecutionLock(input.executionId);
      } catch (err: any) {
        return {
          explanation: "Execution already running.",
          message: { type: "text", content: "Execution already running." },
          metadata: { executionId: input.executionId, status: "executing" },
        };
      }
    }
    const stageToStep: Record<string, string> = {
      "understand-purpose": "intent",
      "extract-entities": "entities",
      "resolve-integrations": "integrations",
      "define-actions": "actions",
      "build-workflows": "workflows",
      "design-views": "views",
      "validate-spec": "compile",
    };
    const compilerResult = await ToolCompiler.run({
        prompt: resolvedPrompt,
        sessionId: builderSessionId,
        userId: userId, // Use authoritative userId
        orgId: buildContext.orgId, // Use authoritative orgId
        toolId: input.toolId,
        connectedIntegrationIds: input.connectedIntegrationIds,
        executionId: input.executionId,
        onUsage: consumeTokens,
        onProgress: (event) => {
          const stepId = stageToStep[event.stage];
          if (!stepId) return;
          
          // Map stages to state machine transitions
          if (event.status === "completed") {
            if (event.stage === "extract-entities") void transition("ENTITIES_EXTRACTED", "Entities identified");
            if (event.stage === "resolve-integrations") void transition("INTEGRATIONS_RESOLVED", "Integrations selected");
            if (event.stage === "define-actions") void transition("ACTIONS_DEFINED", "Actions defined");
            if (event.stage === "build-workflows") void transition("WORKFLOWS_COMPILED", "Workflows built");
            if (event.stage === "validate-spec") void transition("RUNTIME_READY", "Runtime compiled");
          }

          if (event.status === "started") {
            markStep(steps, stepId, "running", event.message);
            return;
          }
          if (event.status === "completed") {
            markStep(steps, stepId, "success", event.message);
            return;
          }
          markStep(steps, stepId, "error", event.message);
        },
      });

    const canExecute = await canExecuteTool({ toolId: effectiveToolIdValue });
    if (canExecute.ok) {
      console.log(`[Compiler] canExecute true for ${effectiveToolIdValue}, redirecting to runtime`);
      return runToolRuntimePipeline(input);
    }

    // Mark as compiled
    if (input.executionId) {
       await updateExecution(input.executionId, { status: "compiled" });
    }

    // FIX: Compiler Stage Guard - Ensure spec is valid before processing
    if (!compilerResult.spec || !compilerResult.spec.actions || !Array.isArray(compilerResult.spec.actions)) {
         throw new Error("Compiler produced invalid spec: actions array missing or invalid");
    }

    let intentPlanError: Error | null = null;
    spec = canonicalizeToolSpec(compilerResult.spec);
    spec = enforceViewSpecForPrompt(spec, resolvedPrompt);
    try {
      spec = await applyIntentContract(spec, resolvedPrompt);
      spec = await applySemanticPlan(spec, resolvedPrompt);
    } catch (err) {
      intentPlanError = err as Error;
      appendStep(stepsById.get("compile"), `Semantic planning unavailable: ${intentPlanError.message}`);
    }
    spec = await applyGoalPlan(spec, resolvedPrompt);
    if (!intentPlanError) {
      try {
        spec = await applyAnswerContract(spec, resolvedPrompt);
      } catch (err) {
        const warningMessage =
          err instanceof Error ? `Answer contract skipped: ${err.message}` : "Answer contract skipped";
        appendStep(stepsById.get("compile"), warningMessage);
      }
    }
    if (assumptions.length > 0) {
      const existing = Array.isArray(spec.clarifications) ? spec.clarifications : [];
      spec = { ...spec, clarifications: [...existing, ...assumptions] };
    }
    transition("INTENT_PARSED", "ToolSpec generated");
    markStep(steps, "compile", "running", "Validating spec and runtime wiring");
    const toolSystemValidation = validateToolSystem(spec);
    if (
      !toolSystemValidation.entitiesResolved ||
      !toolSystemValidation.integrationsResolved ||
      !toolSystemValidation.actionsBound ||
      !toolSystemValidation.workflowsBound ||
      !toolSystemValidation.viewsBound
    ) {
      const errorMsg = `Tool Validation Failed:\n${toolSystemValidation.errors.join("\n")}`;
      toolSystemValidation.errors.forEach((error) => appendStep(stepsById.get("compile"), error));
      markStep(steps, "compile", "error", "Validation failed");
      throw new Error(errorMsg);
    }
    compiledTool = buildCompiledToolArtifact(spec);
    if (input.executionId) {
      await updateExecution(input.executionId, { status: "compiled" });
    }
    markStep(steps, "compile", "success", "Runtime compiled");
    markStep(steps, "views", "running", "Preparing runtime views");

    const baseSpec = isToolSystemSpec(input.currentSpec) ? input.currentSpec : null;
    const normalizedSpecResult = normalizeToolSpec(spec, {
      sourcePrompt: input.userMessage,
      enforceVersion: true,
    });
    if (!normalizedSpecResult.ok) {
      console.error("[ToolSpecNormalizationFailed]", {
        toolId,
        error: normalizedSpecResult.error,
      });
      throw new Error(`ToolSpec normalization failed: ${normalizedSpecResult.error}`);
    }
    const normalizedSpec = normalizedSpecResult.spec;
    spec = normalizedSpec;
    compiledTool = buildCompiledToolArtifact(normalizedSpec);
    const specValidation = ToolSystemSpecSchema.safeParse(normalizedSpec);
    const { data: projectSnapshot } = await (supabase.from("projects") as any)
      .select("spec, active_version_id, status, name, compiled_at")
      .eq("id", toolId)
      .single();
    console.log("[ToolPersistence] Validation Result:", {
        success: specValidation.success,
        error: specValidation.success ? null : specValidation.error,
        status: compilerResult.status
    });
    
    // For persistence, we accept "completed" OR "degraded" as valid states if validation passes
    const shouldPersistVersion = ["completed", "degraded"].includes(compilerResult.status) && specValidation.success;
    console.log("[ToolPersistence] Should Persist:", shouldPersistVersion);

    if (shouldPersistVersion) {
      let createdVersionId: string | null = null;
      try {
        if (!existingExecution?.toolVersionId) {
          // GUARD: Strict Invariant Check
          const { data: toolCheck } = await (supabase.from("tools") as any).select("id").eq("id", toolId).single();
          if (!toolCheck) throw new Error("Invariant: Cannot create tool version without tool row in 'tools' table");

          console.log("[ToolPersistence] Creating version for tool:", toolId);
          const compiled = compiledTool!;
          const version = await createToolVersion({
            orgId,
            toolId,
            userId,
            spec: normalizedSpec,
            compiledTool: compiled,
            baseSpec,
            supabase, // Pass shared client
          });
          createdVersionId = version.id;
          console.log("[ToolPersistence] Version created:", version.id);
          await promoteToolVersion({ toolId, versionId: version.id, supabase });
          console.log("[ToolPersistence] Version promoted");
          if (input.executionId) {
            await updateExecution(input.executionId, { toolVersionId: version.id });
          }
        }
        console.log("[ToolPersistence] Updating project status to READY");
        const { error: projectError } = await (supabase.from("projects") as any)
          .update({
            spec: normalizedSpec,
            name: normalizedSpec.name,
            status: "READY",
            updated_at: new Date().toISOString(),
            compiled_at: new Date().toISOString(),
          })
          .eq("id", toolId);
        if (projectError) {
          throw new Error(`Project update failed: ${projectError.message}`);
        }
        console.log("[ToolPersistence] Project updated successfully");
      } catch (err: any) {
        console.error("[ToolPersistence] CRITICAL FAILURE:", err);
        if (createdVersionId) {
          try {
            const previousActiveVersionId = projectSnapshot?.active_version_id ?? null;
            const previousSpec = projectSnapshot?.spec ?? null;
            const previousStatus = projectSnapshot?.status ?? "DRAFT";
            const previousName = projectSnapshot?.name ?? "Tool";
            const previousCompiledAt = projectSnapshot?.compiled_at ?? null;
            if (previousActiveVersionId) {
              await (supabase.from("tool_versions") as any)
                .update({ status: "active" })
                .eq("id", previousActiveVersionId);
            }
            await (supabase.from("tool_versions") as any)
              .delete()
              .eq("id", createdVersionId);
            await (supabase.from("projects") as any)
              .update({
                active_version_id: previousActiveVersionId,
                spec: previousSpec,
                status: previousStatus,
                name: previousName,
                compiled_at: previousCompiledAt,
              })
              .eq("id", toolId);
          } catch (rollbackError) {
            console.error("[ToolPersistence] Rollback failed:", rollbackError);
          }
        }
        throw err;
      }
    } else {
        console.warn("[ToolPersistence] Skipping persistence because validation failed or compiler incomplete", {
            status: compilerResult.status,
            validationErrors: specValidation.success ? [] : specValidation.error
        });
    }

    const lowConfidenceEntities = spec.entities.filter((entity) => (entity.confidence ?? 1) < 0.7);
    const lowConfidenceActions = spec.actions.filter((action) => (action.confidence ?? 1) < 0.7);
    if (lowConfidenceEntities.length > 0) {
      lowConfidenceEntities.forEach((entity) => {
        appendStep(
          stepsById.get("entities"),
          `Low confidence ${entity.name} (${(entity.confidence ?? 0).toFixed(2)})`,
        );
      });
    }
    if (lowConfidenceActions.length > 0) {
      lowConfidenceActions.forEach((action) => {
        appendStep(
          stepsById.get("actions"),
          `Low confidence ${action.name} (${(action.confidence ?? 0).toFixed(2)})`,
        );
      });
    }

    const connectedIntegrationIds = input.connectedIntegrationIds ?? [];
    await transition("RUNTIME_READY", "Validating integrations");
    const requiredIntegrations = Array.from(
      new Set([
        ...(spec.integrations ?? []).map((i) => i.id),
        ...(spec.actions ?? []).map((a) => a.integrationId).filter(Boolean),
      ]),
    ) as IntegrationId[];
    const missingIntegrationIds = requiredIntegrations.filter(
      (id) => !connectedIntegrationIds.includes(id),
    );
    if (missingIntegrationIds.length > 0) {
      appendStep(
        stepsById.get("readiness"),
        `Integrations not connected: ${missingIntegrationIds.join(", ")}.`,
      );
      markStep(steps, "readiness", "error", "Integrations required");
      if (input.executionId) {
        await updateExecution(input.executionId, {
          status: "awaiting_integration",
          requiredIntegrations,
          missingIntegrations: missingIntegrationIds,
        });
      }
      return {
        explanation: "Connect the required integrations to continue.",
        message: { type: "text", content: "Connect the required integrations to continue." },
        spec: { ...spec, lifecycle_state: machine.state },
        requiresIntegrations: true,
        missingIntegrations: missingIntegrationIds,
        requiredIntegrations,
        metadata: {
          requiresIntegrations: true,
          missingIntegrations: missingIntegrationIds,
          requiredIntegrations,
          executionId: input.executionId,
          build_steps: steps,
          progress: compilerResult.progress,
        },
      };
    }

    markStep(steps, "readiness", "running", "Validating data readiness");
    
    // FIX: Pre-runtime Integration Readiness Gate
    // Must run BEFORE runDataReadiness to avoid EncryptionKeyMismatchError
    try {
      await runCheckIntegrationReadiness({
        spec: spec as any,
        orgId: buildContext.orgId,
      });
    } catch (err) {
      if (isIntegrationNotConnectedError(err)) {
        markStep(steps, "readiness", "error", "Integration authorization required");
        
        const missingIntegrations = err.integrationIds;
        const requiredIntegrations = missingIntegrations; // For now, treat all missing as required context

        if (input.executionId) {
          await updateExecution(input.executionId, {
            status: "awaiting_integration",
            requiredIntegrations,
            missingIntegrations,
          });
        }
        return {
          explanation: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.`,
          message: { type: "text", content: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.` },
          spec: { ...spec, lifecycle_state: machine.state },
          requiresIntegrations: true,
          missingIntegrations,
          requiredIntegrations,
          metadata: {
            requiresIntegrations: true,
            missingIntegrations,
            requiredIntegrations,
            executionId: input.executionId,
            build_steps: steps,
            progress: compilerResult.progress,
            integration_error: {
                type: "INTEGRATION_NOT_CONNECTED",
                integrationIds: err.integrationIds,
                requiredBy: err.requiredBy,
                blockingActions: err.blockingActions
            }
          },
        };
      }
      throw err;
    }

    const readinessStart = Date.now();
    const readiness = await runDataReadiness(spec, {
      orgId: buildContext.orgId,
      toolId: input.toolId,
      userId,
      compiledTool: compiledTool!
    });
    if (readiness.authErrors.length > 0) {
      markStep(steps, "readiness", "error", "Integration authorization required");
      if (input.executionId) {
        await updateExecution(input.executionId, {
          status: "awaiting_integration",
          requiredIntegrations,
          missingIntegrations: readiness.authErrors,
        });
      }
      return {
        explanation: "Reconnect the required integrations to continue.",
        message: { type: "text", content: "Reconnect the required integrations to continue." },
        spec: { ...spec, lifecycle_state: machine.state },
        requiresIntegrations: true,
        missingIntegrations: readiness.authErrors,
        requiredIntegrations,
        metadata: {
          requiresIntegrations: true,
          missingIntegrations: readiness.authErrors,
          requiredIntegrations,
          executionId: input.executionId,
          build_steps: steps,
          progress: compilerResult.progress,
        },
      };
    }
    const readinessDuration = Date.now() - readinessStart;
    if (readinessDuration > TIME_BUDGETS.readinessMs) {
      appendStep(stepsById.get("readiness"), `Readiness exceeded ${TIME_BUDGETS.readinessMs}ms.`);
      await transition("DEGRADED", "Readiness budget exceeded", "warn");
    }
    readiness.logs.forEach((log) => appendStep(stepsById.get("readiness"), log));
    markStep(steps, "readiness", "success", "Data readiness checks complete");
    console.log("[FINALIZE] All integrations completed for tool", input.toolId);
    markStep(steps, "runtime", "running", "Finalizing tool");

    try {
      await saveMemory({
        scope: { type: "tool_org", toolId: input.toolId, orgId: buildContext.orgId },
        namespace: builderNamespace,
        key: "lifecycle_state",
        value: { state: machine.state, buildId },
      });
    } catch (err) {
      console.error("[LifecyclePersistenceFailed]", err);
    }





    let outputs: Array<{ action: any; output: any; error?: any }> = [];
    let goalEvidence: GoalEvidence | null = null;
    const integrationStatuses: Record<string, IntegrationStatus> = {};
    
    const readActions = (spec.actions || []).filter((action) => action.type === "READ");
    const queryPlanByAction = new Map((spec.query_plans ?? []).map((plan) => [plan.actionId, plan]));
    
    if (spec.initialFetch?.actionId) {
        const initial = spec.actions.find(a => a.id === spec.initialFetch?.actionId);
        if (initial && !readActions.find(a => a.id === initial.id)) {
            readActions.unshift(initial);
        }
    }
    
    const slackRequired = isSlackRequired(input.userMessage, spec.intent_contract);
    if (slackRequired) {
        try {
          const status = await getIntegrationTokenStatus(buildContext.orgId, "slack");
          if (status.status !== "valid") {
            integrationStatuses.slack = {
              integration: "slack",
              status: "reauth_required",
              reason: status.status === "missing" ? "missing_credentials" : "token_expired_no_refresh",
              required: true,
              userActionRequired: true,
            };
            await updateIntegrationConnectionStatus(buildContext.orgId, "slack", "reauth_required");
          }
        } catch (err) {
          integrationStatuses.slack = {
            integration: "slack",
            status: "reauth_required",
            reason: err instanceof Error ? err.message : "missing_credentials",
            required: true,
            userActionRequired: true,
          };
          await updateIntegrationConnectionStatus(buildContext.orgId, "slack", "reauth_required");
        }
    }

    if (integrationStatuses.slack?.status === "reauth_required" && integrationStatuses.slack?.required) {
        outputs = [];
        goalEvidence = {
          failed_commits: 0,
          failure_incidents: 0,
          related_emails: 0,
          total_emails: 0,
        };
    } else if (intentPlanError) {
        outputs = [];
        goalEvidence = {
          failed_commits: 0,
          failure_incidents: 0,
          related_emails: 0,
          total_emails: 0,
        };
    } else if (shouldUseSemanticPlannerLoop(spec, input.userMessage)) {
        const planResult = await runSemanticExecutorLoop({
          spec,
          compiledTool: compiledTool!,
          orgId: buildContext.orgId,
          toolId,
          userId,
          prompt: input.userMessage,
        });
        outputs = planResult.outputs;
        goalEvidence = planResult.evidence;
    } else if (readActions.length > 0) {
        console.log(`[ToolRuntime] Executing ${readActions.length} read actions...`);
        markStep(steps, "runtime", "running", "Executing actions...");
        
        for (const action of readActions) {
            try {
                 const plan = queryPlanByAction.get(action.id);
                 const input = buildReadActionInput({ action, plan, spec });
                 if (action.integrationId === "slack" && !slackRequired) {
                    if (!integrationStatuses.slack) {
                      try {
                        const status = await getIntegrationTokenStatus(buildContext.orgId, "slack");
                        if (status.status !== "valid") {
                          integrationStatuses.slack = {
                            integration: "slack",
                            status: "reauth_required",
                            reason: status.status === "missing" ? "missing_credentials" : "token_expired_no_refresh",
                            required: false,
                            userActionRequired: true,
                          };
                        } else {
                          integrationStatuses.slack = { integration: "slack", status: "ok", required: false };
                        }
                      } catch (err) {
                        integrationStatuses.slack = {
                          integration: "slack",
                          status: "reauth_required",
                          reason: err instanceof Error ? err.message : "missing_credentials",
                          required: false,
                          userActionRequired: true,
                        };
                      }
                    }
                    if (integrationStatuses.slack?.status === "reauth_required") {
                      outputs.push({ action, output: null, error: { skipped: true, reason: "slack_reauth_required" } });
                      continue;
                    }
                 }
                 const result = await executeToolAction({
                      orgId: buildContext.orgId,
                      toolId,
                      compiledTool: compiledTool!,
                      actionId: action.id,
                      input,
                      userId: userId,
                      triggerId: "initial_run",
                      recordRun: true
                 });
                 if (result.events?.length) {
                   for (const event of result.events) {
                     if (event.type === "integration_warning" && event.payload?.integration === "slack") {
                       integrationStatuses.slack = {
                         integration: "slack",
                         status: "reauth_required",
                         reason: event.payload?.reason ?? "token_expired_no_refresh",
                         required: slackRequired,
                         userActionRequired: true,
                       };
                     }
                   }
                 }
                 outputs.push({ action, output: result.output });
            } catch (err) {
                console.warn(`[ToolRuntime] Action ${action.id} failed:`, err);
                outputs.push({ action, output: null, error: err });
            }
        }
    }

      const successfulOutputs = outputs.filter((entry) => !entry.error && entry.output !== null && entry.output !== undefined);
      const validation = validateFetchedData(
        successfulOutputs.map((entry) => ({ action: entry.action, output: entry.output })),
        spec.answer_contract
      );
      if (validation.violations.length > 0) {
        console.warn("[AnswerContract] Violations", validation.violations);
      }
      if (!goalEvidence) {
        const derivedOutput = validation.outputs.find((entry) => entry.action.id === "github.failure.incidents")?.output;
        if (Array.isArray(derivedOutput)) {
          goalEvidence = buildEvidenceFromDerivedIncidents(derivedOutput);
        }
      }
      const relevance = evaluateRelevanceGate({
        intentContract: spec.intent_contract,
        outputs: validation.outputs.map((entry) => ({ output: entry.output })),
      });
      const snapshotRecords = buildSnapshotRecords({
        spec,
        outputs: validation.outputs,
        previous: null,
      });

      const integrationResults = snapshotRecords.integrations ?? {};
      const recordCount = countSnapshotRecords(snapshotRecords);
      const dataReady = recordCount > 0;
      
      const goalValidation = evaluateGoalSatisfaction({
        prompt: input.userMessage,
        goalPlan: spec.goal_plan,
        intentContract: spec.intent_contract,
        evidence: goalEvidence,
        relevance,
        integrationStatuses,
        hasData: dataReady,
      });
      const decision = decideRendering({ prompt: input.userMessage, result: goalValidation });
      console.log("[GoalValidation]", { goalValidation, decision });
      
      if (recordCount > 0 && !dataReady) {
         throw new Error("Invariant violated: Records exist but data_ready is false");
      }

      const viewReady = decision.kind === "render" || dataReady;
      const finalizedAt = new Date().toISOString();
      const snapshot = snapshotRecords;
      const viewSpec: ViewSpecPayload = {
        views: decision.kind === "render" && Array.isArray(spec.views) ? spec.views : [],
        goal_plan: spec.goal_plan,
        intent_contract: spec.intent_contract,
        semantic_plan: spec.semantic_plan,
        goal_validation: goalValidation,
        decision,
        integration_statuses: Object.keys(integrationStatuses).length > 0 ? integrationStatuses : undefined,
        answer_contract: spec.answer_contract,
        query_plans: spec.query_plans,
        tool_graph: spec.tool_graph,
        assumptions: Array.isArray(spec.clarifications) ? spec.clarifications : undefined,
      };

      console.log("[FINALIZE] Writing flags to toolId:", toolId);
      console.error("[FINALIZE CONTEXT]", {
        toolId,
        supabaseUrl: getServerEnv().SUPABASE_URL ?? null,
        schema: "public",
        client: "server",
      });
      let { error: finalizeError } = await (statusSupabase as any).rpc("finalize_tool_render_state", {
        p_tool_id: toolId,
        p_org_id: buildContext.orgId,
        p_integration_data: integrationResults,
        p_snapshot: snapshot,
        p_view_spec: viewSpec,
        p_data_ready: dataReady,
        p_view_ready: viewReady,
        p_finalized_at: finalizedAt,
      });

      if (finalizeError?.message?.includes("finalize_tool_render_state") && (finalizeError?.message?.includes("does not exist") || finalizeError?.message?.includes("Could not find the function"))) {
        const { error: upsertError } = await (statusSupabase as any)
          .from("tool_render_state")
          .upsert({
            tool_id: toolId,
            org_id: buildContext.orgId,
            integration_data: integrationResults ?? {},
            snapshot,
            view_spec: viewSpec,
            data_ready: dataReady,
            view_ready: viewReady,
            finalized_at: finalizedAt,
          });
        if (upsertError) {
          finalizeError = upsertError;
        } else {
          const { error: projectUpdateError } = await (statusSupabase as any)
            .from("projects")
            .update({
              data_snapshot: snapshot,
              data_ready: dataReady,
              view_spec: viewSpec,
              view_ready: viewReady,
              status: viewReady ? "READY" : "FAILED",
              finalized_at: finalizedAt,
              lifecycle_done: true,
            })
            .eq("id", toolId);
          finalizeError = projectUpdateError ?? null;
        }
      }

      if (finalizeError) {
        throw new Error(`Finalize transaction failed: ${finalizeError.message}`);
      }

      const { data: renderState, error: renderStateError } = await (statusSupabase as any)
        .from("tool_render_state")
        .select("tool_id, data_ready, view_ready, finalized_at")
        .eq("tool_id", toolId)
        .eq("org_id", buildContext.orgId)
        .maybeSingle();

      console.error("[FINALIZE VERIFICATION]", {
        toolId,
        data: renderState ?? null,
        error: renderStateError ?? null,
        supabaseUrl: getServerEnv().SUPABASE_URL ?? null,
      });

      if (renderStateError || !renderState) {
        throw new Error("FINALIZE CLAIMED SUCCESS BUT tool_render_state ROW DOES NOT EXIST");
      }
      if (renderState.view_ready !== viewReady) {
        throw new Error("FINALIZE CLAIMED SUCCESS BUT view_ready MISMATCH");
      }
      if (renderState.data_ready !== dataReady) {
        throw new Error("FINALIZE CLAIMED SUCCESS BUT data_ready MISMATCH");
      }

      const { data: updatedTool, error: verifyError } = await (statusSupabase as any)
        .from("projects")
        .select("id, data_ready, view_ready")
        .eq("id", toolId)
        .single();

      if (verifyError) {
        throw new Error(`Finalize DB update failed: ${verifyError.message}`);
      }
      if (!updatedTool || updatedTool.view_ready !== viewReady || updatedTool.data_ready !== dataReady) {
        throw new Error("Finalize flags did NOT persist");
      }

      console.log("[FINALIZE] Integrations completed AND state persisted", {
        toolId,
        render_state: renderState.tool_id,
        flags: updatedTool,
      });
      
      // 7. Finalize Environment (REQUIRED)
      // Even if no actions or all failed, we must finalize to ACTIVE or FAILED.
      // This persists the unified environment object and sets status=ACTIVE.
      if (spec) {
        console.log("[ToolRuntime] Runtime completed");
        let matResult;
        try {
          markStep(steps, "runtime", "running", "Finalizing environment...");
          matResult = await finalizeToolEnvironment(
              toolId,
              buildContext.orgId,
              spec,
              outputs,
              null
          );
        } catch (err: any) {
            console.error(`[ToolRuntime] Fatal Finalization Error (Materialization):`, err);
            throw new Error(`Fatal Finalization Error: ${err.message}`);
        }

        const success = matResult.status === "MATERIALIZED";
        if (success) {
          markStep(steps, "runtime", "success", "Environment READY");
          console.log(`[ToolDataReadiness] Materialized tool ${toolId}. Status: READY`);
        } else {
          markStep(steps, "runtime", "error", "Environment Finalization Failed");
          console.log(`[ToolDataReadiness] Materialized tool ${toolId}. Status: FAILED`);
          throw new Error("Materialization returned FAILED status");
        }
      }

      if (viewReady) {
        markStep(steps, "views", "success", "Output ready");
      }

      if (input.executionId) {
        await completeExecution(input.executionId);
      }
      const assistantSummary = buildAssistantSummary(spec);
    return {
      explanation: assistantSummary,
      message: { type: "text", content: assistantSummary },
      spec: { ...spec, lifecycle_state: machine.state },
      metadata: {
        tokens: runTokens,
        status: compilerResult.status,
        versionId: activeVersionId,
        progress: compilerResult.progress,
        steps,
        build_logs: machine.logs,
        assumptions,
        completenessScore,
          executionId: input.executionId,
      },
    };
  } catch (err) {
    if (isIntegrationNotConnectedError(err)) {
      console.warn(`[Compiler] Integrations missing: ${err.integrationIds.join(", ")}`);
      
      const missingIntegrations = err.integrationIds;
      // We don't have the full list of required integrations here easily without recalculating, 
      // but for the error response, the missing ones are the most critical.
      // We can use the missing ones as "required" for this context if we want to block on them.
      const requiredIntegrations = missingIntegrations;

      // Mark execution as waiting, NOT failed
      if (input.executionId) {
        await updateExecution(input.executionId, {
          status: "awaiting_integration",
          requiredIntegrations,
          missingIntegrations,
        });
      }

      // Return structured response
      return {
        explanation: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.`,
        message: { type: "text", content: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.` },
        spec: input.currentSpec ?? {},
        requiresIntegrations: true,
        missingIntegrations,
        requiredIntegrations,
        metadata: {
          requiresIntegrations: true,
          missingIntegrations,
          requiredIntegrations,
          executionId: input.executionId,
          build_steps: steps,
          integration_error: {
              type: "INTEGRATION_NOT_CONNECTED",
              integrationIds: err.integrationIds, // Updated to array
              integrationId: err.integrationIds[0], // Backwards compatibility if needed
              requiredBy: err.requiredBy,
              blockingActions: err.blockingActions
          }
        },
      };
    }

    // Atomic Failure Handling: Mark tool as error
    const message = err instanceof Error ? err.message : "Build failed";
    markStep(steps, "compile", "error", message);
    if (input.executionId) {
      await updateExecution(input.executionId, { status: "failed", error: message });
      await completeExecution(input.executionId);
    }
    
    const compilerFailure = isCompilerError(err);
    if (compilerFailure) {
      await transition("FAILED_COMPILATION", message, "error");
      try {
        await finalizeToolExecution({
          toolId,
          status: "FAILED",
          errorMessage: message,
          data_ready: false,
          view_ready: false,
        });
      } catch (finalizeErr) {
        console.error("[CompilerFinalizeFailed]", finalizeErr);
      }
    } else {
      const isInfraError =
        message.includes("Timeout") ||
        message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("500") ||
        message.includes("network");
      const failureState = isInfraError ? "INFRA_ERROR" : "DEGRADED";
      await transition(failureState, message, "error");
    }
    
    if (err instanceof BudgetExceededError) {
      return {
        explanation: "Budget limit reached",
        message: {
          type: "text",
          content:
            err.limitType === "per_run"
              ? "Run token cap exceeded. Reduce scope or increase the per-run budget."
              : "Monthly token budget exceeded. Increase the monthly budget to continue.",
        },
        metadata: {
          persist: false,
          build_steps: steps,
          state: machine.state,
          build_logs: machine.logs,
          budget_error: { type: err.limitType, message: err.message },
        },
      };
    }
    throw err;
  }

  const refinements = await withTimeout(
    runRefinementAgent(spec, consumeTokens),
    500,
    "Refinement suggestions timed out",
  ).catch(() => []);
  const assistantSummary = buildAssistantSummary(spec);
  return {
    explanation: assistantSummary,
    message: { type: "text", content: assistantSummary },
    spec: { ...spec, lifecycle_state: machine.state },
    metadata: {
      persist: true,
      build_steps: steps,
      query_plans: buildQueryPlans(spec),
      refinements,
      data_evidence: latestEvidence,
      state: machine.state,
      build_logs: machine.logs,
      active_version_id: activeVersionId,
      assumptions,
      completenessScore,
    },
  };
  });
}

export async function resumeToolExecution(params: {
  executionId: string;
  orgId: string;
  toolId: string;
  userId?: string | null;
  prompt: string;
  spec: ToolSystemSpec;
  compiledTool: CompiledToolArtifact;
}): Promise<ToolChatResponse> {
  const statusSupabase = createSupabaseAdminClient();
  const execution = await getExecutionById(params.executionId);
  if (!execution) throw new Error("Execution not found");
  
  if (["compiling", "executing"].includes(execution.status)) {
     return {
       explanation: "Execution already running.",
       message: { type: "text", content: "Execution already running." },
       metadata: { executionId: params.executionId, status: "executing" },
     };
  }
  
  if (execution.status === "completed") {
      return {
        explanation: "Execution completed.",
        message: { type: "text", content: "Execution completed." },
        metadata: { executionId: params.executionId, status: "completed" },
      };
  }

  if (["created", "awaiting_integration"].includes(execution.status)) {
       await updateExecution(params.executionId, { status: "executing" });
  }

  // Integration Readiness Gate: Verify all required integrations are connected
  // This must happen before any data fetching or credential access.
  try {
    await runCheckIntegrationReadiness({
        spec: params.spec as any,
        orgId: params.orgId,
    });
  } catch (err) {
    if (isIntegrationNotConnectedError(err)) {
      const missingIntegrations = err.integrationIds;
      const requiredIntegrations = missingIntegrations;

      // Mark execution as waiting, NOT failed
      await updateExecution(params.executionId, {
        status: "awaiting_integration",
        requiredIntegrations,
        missingIntegrations,
      });

      return {
        explanation: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.`,
        message: { type: "text", content: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.` },
        spec: params.spec,
        requiresIntegrations: true,
        missingIntegrations,
        requiredIntegrations,
        metadata: {
          requiresIntegrations: true,
          missingIntegrations,
          requiredIntegrations,
          executionId: params.executionId,
          integration_error: {
              type: "INTEGRATION_NOT_CONNECTED",
              integrationIds: err.integrationIds,
              requiredBy: err.requiredBy,
              blockingActions: err.blockingActions
          }
        },
      };
    }
    throw err;
  }

  let outputs: Array<{ action: any; output: any; error?: any }> = [];
  let goalEvidence: GoalEvidence | null = null;
  const integrationStatuses: Record<string, IntegrationStatus> = {};

  const readActions = (params.spec.actions || []).filter((action) => action.type === "READ");
  const queryPlanByAction = new Map((params.spec.query_plans ?? []).map((plan) => [plan.actionId, plan]));

  if (params.spec.initialFetch?.actionId) {
    const initial = params.spec.actions.find(a => a.id === params.spec.initialFetch?.actionId);
    if (initial && !readActions.find(a => a.id === initial.id)) {
      readActions.unshift(initial);
    }
  }

  const slackRequired = isSlackRequired(params.prompt, params.spec.intent_contract);
  if (slackRequired) {
    try {
      const status = await getIntegrationTokenStatus(params.orgId, "slack");
      if (status.status !== "valid") {
        integrationStatuses.slack = {
          integration: "slack",
          status: "reauth_required",
          reason: status.status === "missing" ? "missing_credentials" : "token_expired_no_refresh",
          required: true,
          userActionRequired: true,
        };
        await updateIntegrationConnectionStatus(params.orgId, "slack", "reauth_required");
      }
    } catch (err) {
      integrationStatuses.slack = {
        integration: "slack",
        status: "reauth_required",
        reason: err instanceof Error ? err.message : "missing_credentials",
        required: true,
        userActionRequired: true,
      };
      await updateIntegrationConnectionStatus(params.orgId, "slack", "reauth_required");
    }
  }

  if (integrationStatuses.slack?.status === "reauth_required" && integrationStatuses.slack?.required) {
    outputs = [];
    goalEvidence = {
      failed_commits: 0,
      failure_incidents: 0,
      related_emails: 0,
      total_emails: 0,
    };
  } else if (shouldUseSemanticPlannerLoop(params.spec, params.prompt)) {
    const planResult = await runSemanticExecutorLoop({
      spec: params.spec,
      compiledTool: params.compiledTool,
      orgId: params.orgId,
      toolId: params.toolId,
      userId: params.userId,
      prompt: params.prompt,
    });
    outputs = planResult.outputs;
    goalEvidence = planResult.evidence;
  } else if (readActions.length > 0) {
    for (const action of readActions) {
      try {
        const plan = queryPlanByAction.get(action.id);
        const input = buildReadActionInput({ action, plan, spec: params.spec });
        if (action.integrationId === "slack" && !slackRequired) {
          if (!integrationStatuses.slack) {
            try {
              const status = await getIntegrationTokenStatus(params.orgId, "slack");
              if (status.status !== "valid") {
                integrationStatuses.slack = {
                  integration: "slack",
                  status: "reauth_required",
                  reason: status.status === "missing" ? "missing_credentials" : "token_expired_no_refresh",
                  required: false,
                  userActionRequired: true,
                };
              } else {
                integrationStatuses.slack = { integration: "slack", status: "ok", required: false };
              }
            } catch (err) {
              integrationStatuses.slack = {
                integration: "slack",
                status: "reauth_required",
                reason: err instanceof Error ? err.message : "missing_credentials",
                required: false,
                userActionRequired: true,
              };
            }
          }
          if (integrationStatuses.slack?.status === "reauth_required") {
            outputs.push({ action, output: null, error: { skipped: true, reason: "slack_reauth_required" } });
            continue;
          }
        }
        const result = await executeToolAction({
          orgId: params.orgId,
          toolId: params.toolId,
          compiledTool: params.compiledTool,
          actionId: action.id,
          input,
          userId: params.userId,
          triggerId: "resume_run",
          recordRun: true
        });
        if (result.events?.length) {
          for (const event of result.events) {
            if (event.type === "integration_warning" && event.payload?.integration === "slack") {
              integrationStatuses.slack = {
                integration: "slack",
                status: "reauth_required",
                reason: event.payload?.reason ?? "token_expired_no_refresh",
                required: slackRequired,
                userActionRequired: true,
              };
            }
          }
        }
        outputs.push({ action, output: result.output });
      } catch (err) {
        outputs.push({ action, output: null, error: err });
      }
    }
  }

  const successfulOutputs = outputs.filter((entry) => !entry.error && entry.output !== null && entry.output !== undefined);
  const validation = validateFetchedData(
    successfulOutputs.map((entry) => ({ action: entry.action, output: entry.output })),
    params.spec.answer_contract
  );
  if (validation.violations.length > 0) {
    console.warn("[AnswerContract] Violations", validation.violations);
  }
  if (!goalEvidence) {
    const derivedOutput = validation.outputs.find((entry) => entry.action.id === "github.failure.incidents")?.output;
    if (Array.isArray(derivedOutput)) {
      goalEvidence = buildEvidenceFromDerivedIncidents(derivedOutput);
    }
  }
  const relevance = evaluateRelevanceGate({
    intentContract: params.spec.intent_contract,
    outputs: validation.outputs.map((entry) => ({ output: entry.output })),
  });
  const snapshotRecords = buildSnapshotRecords({
    spec: params.spec,
    outputs: validation.outputs,
    previous: null,
  });

  const integrationResults = snapshotRecords.integrations ?? {};
  const recordCount = countSnapshotRecords(snapshotRecords);
  const dataReady = recordCount > 0;
  
  const goalValidation = evaluateGoalSatisfaction({
    prompt: params.prompt,
    goalPlan: params.spec.goal_plan,
    intentContract: params.spec.intent_contract,
    evidence: goalEvidence,
    relevance,
    integrationStatuses,
    hasData: dataReady,
  });
  const decision = decideRendering({ prompt: params.prompt, result: goalValidation });
  
  if (recordCount > 0 && !dataReady) {
      throw new Error("Invariant violated: Records exist but data_ready is false");
  }

  const viewReady = decision.kind === "render" || dataReady;
  const finalizedAt = new Date().toISOString();
  const snapshot = snapshotRecords;
  const viewSpec: ViewSpecPayload = {
    views: decision.kind === "render" && Array.isArray(params.spec.views) ? params.spec.views : [],
    goal_plan: params.spec.goal_plan,
    intent_contract: params.spec.intent_contract,
    semantic_plan: params.spec.semantic_plan,
    goal_validation: goalValidation,
    decision,
    integration_statuses: Object.keys(integrationStatuses).length > 0 ? integrationStatuses : undefined,
    answer_contract: params.spec.answer_contract,
    query_plans: params.spec.query_plans,
    tool_graph: params.spec.tool_graph,
    assumptions: Array.isArray(params.spec.clarifications) ? params.spec.clarifications : undefined,
  };

  let { error: finalizeError } = await (statusSupabase as any).rpc("finalize_tool_render_state", {
    p_tool_id: params.toolId,
    p_org_id: params.orgId,
    p_integration_data: integrationResults,
    p_snapshot: snapshot,
    p_view_spec: viewSpec,
    p_data_ready: dataReady,
    p_view_ready: viewReady,
    p_finalized_at: finalizedAt,
  });

  if (finalizeError?.message?.includes("finalize_tool_render_state") && (finalizeError?.message?.includes("does not exist") || finalizeError?.message?.includes("Could not find the function"))) {
    const { error: upsertError } = await (statusSupabase as any)
      .from("tool_render_state")
      .upsert({
        tool_id: params.toolId,
        org_id: params.orgId,
        integration_data: integrationResults ?? {},
        snapshot,
        view_spec: viewSpec,
        data_ready: dataReady,
        view_ready: viewReady,
        finalized_at: finalizedAt,
      });
    if (upsertError) {
      finalizeError = upsertError;
    } else {
      const { error: projectUpdateError } = await (statusSupabase as any)
        .from("projects")
        .update({
          data_snapshot: snapshot,
          data_ready: dataReady,
          view_spec: viewSpec,
          view_ready: viewReady,
          status: dataReady ? "READY" : "FAILED",
          finalized_at: finalizedAt,
          lifecycle_done: true,
        })
        .eq("id", params.toolId);
      finalizeError = projectUpdateError ?? null;
    }
  }

  if (finalizeError) {
    await updateExecution(params.executionId, { status: "failed" });
    await completeExecution(params.executionId);
    throw new Error(`Finalize transaction failed: ${finalizeError.message}`);
  }

  await updateExecution(params.executionId, { status: "completed" });
  await completeExecution(params.executionId);
  const assistantSummary = buildAssistantSummary(params.spec);
  return {
    explanation: assistantSummary,
    message: { type: "text", content: assistantSummary },
    spec: params.spec,
    metadata: { executionId: params.executionId, data_ready: dataReady, view_ready: viewReady },
  };
}

export async function applyClarificationAnswer(
  orgId: string,
  toolId: string,
  userId: string | undefined | null,
  answer: string
): Promise<ToolChatResponse> {
    // Wrapper to satisfy the requirement "Implement applyClarificationAnswer(answer) -> updates spec"
    // This re-uses the main pipeline which handles the "resume from pending" logic automatically
    // via the memory store (pending_questions + base_prompt).
    return processToolChat({
        orgId,
        toolId,
        userId,
        messages: [], // Context is in memory
        userMessage: answer,
        connectedIntegrationIds: [], // Should be loaded from context if needed, but usually persistent
        mode: "create",
    });
}

async function generateIntent(
  prompt: string,
  onUsage?: (usage?: { total_tokens?: number }) => Promise<void> | void,
  toolId?: string,
): Promise<ToolSystemSpec> {
  const requiredIntegrations = detectIntegrations(prompt);
  const enforcedPrompt = requiredIntegrations.length
    ? `${prompt}\n\nYou MUST include these integrations as sections: ${requiredIntegrations.join(", ")}.`
    : prompt;
  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME,
    messages: [
      { role: "system", content: INTENT_SYSTEM_PROMPT },
      { role: "user", content: enforcedPrompt },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });
  await onUsage?.(response.usage);

  const content = response.choices[0]?.message?.content;
  const first = parseIntent(content, prompt, toolId);
  if (first.ok) {
    enforceRequiredIntegrations(first.value, requiredIntegrations);
    return first.value;
  }

  const retry = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME,
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
  await onUsage?.(retry.usage);

  const retryContent = retry.choices[0]?.message?.content;
  const second = parseIntent(retryContent, prompt, toolId);
  if (!second.ok) {
    throw new Error(`ToolSpec normalization failed: ${second.error}`);
  }
  enforceRequiredIntegrations(second.value, requiredIntegrations);
  return second.value;
}

function parseIntent(
  content: string | null | undefined,
  sourcePrompt: string,
  toolId?: string,
): { ok: true; value: ToolSystemSpec } | { ok: false; error: string } {
  if (!content || typeof content !== "string") {
    return { ok: false, error: "empty response" };
  }
  const normalized = normalizeToolSpec(content, { sourcePrompt, enforceVersion: true });
  if (!normalized.ok) {
    console.error("[ToolSpecNormalizationFailed]", {
      toolId: toolId ?? null,
      error: normalized.error,
      raw: content,
    });
    return { ok: false, error: normalized.error };
  }
  return { ok: true, value: normalized.spec };
}

export const SUPPORTED_INTEGRATIONS = ["google", "github", "slack", "notion", "linear"] as const;

export function detectIntegrations(text: string): Array<ToolSystemSpec["integrations"][number]["id"]> {
  const normalized = text.toLowerCase();
  const hits = new Set<ToolSystemSpec["integrations"][number]["id"]>();
  if (normalized.includes("google") || normalized.includes("gmail") || normalized.includes("drive") || normalized.includes("mail") || normalized.includes("email") || normalized.includes("inbox") || normalized.includes("calendar")) hits.add("google");
  if (normalized.includes("github")) hits.add("github");
  if (normalized.includes("slack")) hits.add("slack");
  if (normalized.includes("notion")) hits.add("notion");
  if (normalized.includes("linear")) hits.add("linear");
  return Array.from(hits);
}

export function resolveIntegrationRequirements(params: {
  prompt: string;
  integrationMode?: "auto" | "manual";
  selectedIntegrationIds?: string[];
  requiredIntegrationIds?: string[];
}) {
  const detected = (
    params.requiredIntegrationIds && params.requiredIntegrationIds.length > 0
      ? params.requiredIntegrationIds
      : detectIntegrations(params.prompt)
  ).filter(
    (id): id is (typeof SUPPORTED_INTEGRATIONS)[number] =>
      SUPPORTED_INTEGRATIONS.includes(id as (typeof SUPPORTED_INTEGRATIONS)[number]),
  );
  if (params.integrationMode === "manual") {
    const selected = (params.selectedIntegrationIds ?? []).filter(
      (id): id is (typeof SUPPORTED_INTEGRATIONS)[number] =>
        SUPPORTED_INTEGRATIONS.includes(id as (typeof SUPPORTED_INTEGRATIONS)[number]),
    );
    if (selected.length === 0) {
      return {
        requiredIntegrations: [],
        mismatchMessage: "Select integrations to continue.",
      };
    }
    const unsupported = detected.filter((id) => !selected.includes(id));
    if (unsupported.length > 0) {
      return {
        requiredIntegrations: selected,
        mismatchMessage: "This integration doesn’t support this action. Try switching integrations.",
      };
    }
    return { requiredIntegrations: selected };
  }
  return { requiredIntegrations: detected };
}

export function resolveAssumptions(prompt?: string) {
  if (!prompt || typeof prompt !== "string") {
    return { resolvedPrompt: "", assumptions: [], completenessScore: 0 };
  }
  const normalized = prompt.toLowerCase();
  const assumptions: Array<{ field: string; reason: string; options?: string[] }> = [];
  const hasTimeRange =
    normalized.includes("today") ||
    normalized.includes("yesterday") ||
    normalized.includes("this week") ||
    normalized.includes("last week") ||
    normalized.includes("this month") ||
    normalized.includes("last month") ||
    normalized.includes("past") ||
    normalized.includes("recent") ||
    normalized.includes("latest") ||
    normalized.includes("newest") ||
    normalized.includes("most recent") ||
    normalized.includes("last 7 days") ||
    normalized.includes("last 30 days");
  if (
    normalized.includes("important") &&
    (normalized.includes("email") || normalized.includes("inbox") || normalized.includes("mail"))
  ) {
    assumptions.push({
      field: "importance_filter",
      reason: "Assumed unread, flagged, or high-priority messages.",
      options: ["unread", "flagged", "high-priority"],
    });
  }
  if (normalized.includes("notify") && !normalized.includes("slack") && !normalized.includes("email")) {
    assumptions.push({
      field: "notification_channel",
      reason: "Assumed Slack for team notifications.",
      options: ["slack", "email"],
    });
  }
  const missingSignals = assumptions.length;
  const completenessScore = Math.max(0.4, 1 - missingSignals * 0.2);
  const resolvedPrompt =
    assumptions.length === 0
      ? prompt
      : `${prompt}\n\nAssumptions applied:\n${assumptions
          .map((item) => `- ${item.field}: ${item.reason}`)
          .join("\n")}`;
  return { resolvedPrompt, assumptions, completenessScore };
}

function buildAssistantSummary(spec: ToolSystemSpec) {
  const integrations = Array.from(
    new Set([
      ...(spec.integrations ?? []).map((i) => i.id),
      ...(spec.actions ?? []).map((a) => a.integrationId).filter(Boolean),
    ]),
  );
  const readActions = (spec.actions ?? []).filter((a) => a.type === "READ").length;
  const writeActions = (spec.actions ?? []).filter((a) => a.type !== "READ").length;
  const integrationText = integrations.length > 0 ? integrations.join(", ") : "your connected systems";
  const actionText =
    readActions > 0 && writeActions > 0
      ? `pulls data and prepares ${writeActions} follow-up action${writeActions > 1 ? "s" : ""}`
      : readActions > 0
      ? "pulls the latest data"
      : "prepares targeted actions";
  return `I built an internal tool that connects to ${integrationText}, ${actionText}, and renders a live view you can refine. Review the output and adjust filters or triggers as needed.`;
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
    { id: "runtime", title: "Fetching data", status: "pending", logs: [] },
    { id: "views", title: "Rendering output", status: "pending", logs: [] },
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

function isCompilerError(error: any) {
  return Boolean(error && typeof error === "object" && error.type === "COMPILER_ERROR");
}

async function runDataReadiness(
  spec: ToolSystemSpec,
  context?: { orgId: string; toolId: string; userId: string | null; compiledTool: CompiledToolArtifact }
) {
  const logs: string[] = [];
  const authErrors: string[] = [];
  const outputs: Array<{ action: ToolSystemSpec["actions"][number]; output: any }> = [];
  const queryPlanByAction = new Map((spec.query_plans ?? []).map((plan) => [plan.actionId, plan]));
  const readActions = spec.actions.filter((action) => {
    const cap = getCapability(action.capabilityId);
    return cap?.allowedOperations.includes("read");
  });

  for (const action of readActions) {
    const cap = getCapability(action.capabilityId);
    if (!cap) {
      logs.push(`Capability missing for ${action.name}.`);
      continue;
    }
    const required = cap.constraints?.requiredFilters ?? [];
    const missing = required.filter((field) => !(action.inputSchema && field in action.inputSchema));
    if (missing.length > 0) {
      logs.push(`Missing inputs ${missing.join(", ")} for ${action.name} (${action.integrationId}).`);
      continue;
    }
    
    if (context) {
      try {
        const plan = queryPlanByAction.get(action.id);
        const input =
          plan && Object.keys(plan.query ?? {}).length > 0
            ? plan.query
            : buildDefaultInput(cap);
        const requiredFilters = cap?.constraints?.requiredFilters ?? [];
        const missing = requiredFilters.filter((key) => input?.[key] === undefined || input?.[key] === null);
        if (missing.length > 0) {
          logs.push(`Skipping ${action.name} (${action.integrationId}) missing ${missing.join(", ")}.`);
          continue;
        }
        logs.push(`Executing ${action.name} (${action.integrationId})...`);
        
        const result = await executeToolAction({
            orgId: context.orgId,
            toolId: context.toolId,
            compiledTool: context.compiledTool,
            actionId: action.id,
            input: input,
            userId: context.userId,
            dryRun: false
        });
        
        const recordCount = Array.isArray(result.output) ? result.output.length : (result.output ? 1 : 0);
        if (recordCount > 0) {
          outputs.push({ action, output: result.output });
          const inferredFields = inferFieldsFromData(result.output);
          if (inferredFields.length > 0) {
            const entity = spec.entities.find(e => e.sourceIntegration === action.integrationId) || spec.entities[0];
            if (entity) {
              const existing = new Set(entity.fields.map(f => f.name));
              let added = 0;
              for (const field of inferredFields) {
                if (!existing.has(field.name)) {
                  entity.fields.push(field);
                  added++;
                }
              }
              if (added > 0) {
                logs.push(`Inferred ${added} new fields for entity '${entity.name}' from live data.`);
              }
            }
          }
          logs.push(`Successfully fetched ${recordCount} records for ${action.name}`);
        } else {
          logs.push(`No records returned for ${action.name}.`);
        }
      } catch (err: any) {
        if (err instanceof IntegrationAuthError || err.name === "IntegrationAuthError") {
            console.warn(`[Readiness] Auth warning for ${action.integrationId}:`, err.message);
            logs.push(`⚠️ Auth required for ${action.integrationId}: ${err.message}`);
            if (!authErrors.includes(action.integrationId)) {
                authErrors.push(action.integrationId);
            }
        } else if (action.integrationId === "slack") {
            // FIX: Slack failures must not block the build
            // Slack tokens often expire and don't refresh easily, but it's an optional integration
            console.warn(`[Readiness] Slack fetch failed (non-fatal):`, err.message);
            logs.push(`⚠️ Slack fetch failed: ${err.message} (ignoring)`);
        } else {
            const msg = err.message || "Unknown error";
            console.error(`[Readiness] Action ${action.name} failed:`, err);
            
            // STRICT MODE: Any data fetch failure fails the build
            throw new Error(`Data fetch failed for ${action.name} (${action.integrationId}): ${msg}`);
        }
      }
    } else {
      logs.push(`Validated inputs for ${action.name} (${action.integrationId}).`);
    }
  }

  return { logs, authErrors, outputs };
}

function buildDefaultInput(cap: NonNullable<ReturnType<typeof getCapability>>) {
  const input: Record<string, any> = {};
  if (cap.id === "google_gmail_list") {
    input.maxResults = 10;
  } else if (cap.supportedFields.includes("maxResults")) {
    input.maxResults = 5;
  }
  if (cap.supportedFields.includes("pageSize")) input.pageSize = 5;
  if (cap.supportedFields.includes("first")) input.first = 5;
  if (cap.supportedFields.includes("limit")) input.limit = 5;
  return input;
}

function buildReadActionInput(params: {
  action: ToolSystemSpec["actions"][number];
  plan?: IntegrationQueryPlan;
  spec: ToolSystemSpec;
}) {
  const query = params.plan?.query ?? {};
  const input: Record<string, any> =
    Object.keys(query).length > 0 ? { ...query } : { limit: params.spec.initialFetch?.limit ?? 10 };
  if (params.action.capabilityId === "google_gmail_list") {
    if (input.order_by === undefined) {
      input.order_by = params.spec.initialFetch?.order_by ?? "internalDate";
    }
    if (input.order_direction === undefined) {
      input.order_direction = params.spec.initialFetch?.order_direction ?? "desc";
    }
  }
  return input;
}

function applySchemaToViews(spec: ToolSystemSpec) {
  const entitiesByName = new Map(spec.entities.map((entity) => [entity.name, entity]));
  const views = spec.views.map((view) => {
    if (view.fields.length > 0) return view;
    const entity = entitiesByName.get(view.source.entity);
    if (!entity || entity.fields.length === 0) return view;
    return {
      ...view,
      fields: entity.fields.map((field) => field.name).slice(0, 6),
    };
  });
  return { ...spec, views };
}

function enforceViewSpecForPrompt(spec: ToolSystemSpec, prompt: string): ToolSystemSpec {
  const normalized = prompt.toLowerCase();
  const wantsEmail = normalized.includes("mail") || normalized.includes("email") || normalized.includes("inbox") || normalized.includes("gmail");
  const wantsGithub = normalized.includes("github");
  const wantsLinear = normalized.includes("linear");
  const wantsNotion = normalized.includes("notion");
  const wantsSlack = normalized.includes("slack");
  const entityIntegration = new Map(spec.entities.map((entity) => [entity.name, entity.sourceIntegration]));
  const entityFields = new Map(spec.entities.map((entity) => [entity.name, entity.fields.map((field) => field.name)]));
  const matchesIntegration = (view: ToolSystemSpec["views"][number]) => {
    const integration = entityIntegration.get(view.source.entity);
    if (!integration) return false;
    if (wantsEmail && integration === "google") return true;
    if (wantsGithub && integration === "github") return true;
    if (wantsLinear && integration === "linear") return true;
    if (wantsNotion && integration === "notion") return true;
    if (wantsSlack && integration === "slack") return true;
    if (!wantsEmail && !wantsGithub && !wantsLinear && !wantsNotion && !wantsSlack) return true;
    return false;
  };
  const filtered = spec.views.filter((view) => matchesIntegration(view));
  if (filtered.length === 0) {
    throw new Error("View spec required but none matched user intent");
  }
  const normalizedViews = filtered.map((view) => {
    const availableFields = entityFields.get(view.source.entity) ?? view.fields;
    if (wantsEmail) {
      return { ...view, fields: ["from", "subject", "snippet", "date"] };
    }
    if (!Array.isArray(view.fields) || view.fields.length === 0) {
      return { ...view, fields: availableFields.slice(0, 6) };
    }
    return view;
  });
  return { ...spec, views: normalizedViews };
}

async function applyGoalPlan(spec: ToolSystemSpec, prompt: string): Promise<ToolSystemSpec> {
  try {
    const goalPlan = await generateGoalPlanWithRetry(prompt);
    const next = augmentSpecForGoalPlan(spec, prompt, goalPlan);
    return { ...next, goal_plan: goalPlan };
  } catch {
    const fallback = buildFallbackGoalPlan(prompt);
    const next = augmentSpecForGoalPlan(spec, prompt, fallback);
    return { ...next, goal_plan: fallback };
  }
}

async function applyIntentContract(spec: ToolSystemSpec, prompt: string): Promise<ToolSystemSpec> {
  try {
    const response = await getAzureOpenAIClient().chat.completions.create({
      model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        {
          role: "system",
          content:
            `Return JSON only: {"userGoal":string,"successCriteria":[string],"implicitConstraints":[string],"hiddenStateRequirements":[string],"timeHorizon":{"window":string,"rationale":string}?, "subjectivityScore":number,"heuristics":[{"id":string,"name":string,"definition":string,"tunableParams":object,"confidence":number}],"requiredEntities":{"integrations":[string],"objects":[string],"filters":[string]},"forbiddenOutputs":[string],"acceptableFallbacks":[string]}.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Intent contract required but invalid");
    }
    const parsed = IntentContractSchema.safeParse(JSON.parse(content));
    if (!parsed.success) {
      throw new Error("Intent contract required but invalid");
    }
    return { ...spec, intent_contract: parsed.data };
  } catch {
    const fallback = buildFallbackIntentContract(prompt);
    return { ...spec, intent_contract: fallback };
  }
}

function buildFallbackIntentContract(prompt: string): IntentContract {
  const normalized = prompt.toLowerCase();
  const heuristics = [];
  if (normalized.includes("reply") || normalized.includes("respond")) {
    heuristics.push({
      id: "reply_urgency",
      name: "Reply urgency",
      definition: "Unreplied messages older than 48h with high-priority sender",
      tunableParams: { minHours: 48, priorityThreshold: 0.7 },
      confidence: 0.6,
    });
  }
  if (normalized.includes("commitment") || normalized.includes("follow up")) {
    heuristics.push({
      id: "follow_up_gap",
      name: "Follow-up gap",
      definition: "Commitments with no action within 7 days of promise",
      tunableParams: { maxDaysWithoutAction: 7 },
      confidence: 0.55,
    });
  }
  if (normalized.includes("cold") || normalized.includes("going cold")) {
    heuristics.push({
      id: "cooling_clients",
      name: "Cooling clients",
      definition: "No interaction in 14 days with previously active contacts",
      tunableParams: { inactivityDays: 14 },
      confidence: 0.5,
    });
  }
  return {
    userGoal: prompt,
    successCriteria: ["Rank items by urgency", "Surface items requiring response"],
    implicitConstraints: ["Prefer most recent activity", "Prioritize high-signal senders"],
    hiddenStateRequirements: ["Track last response time", "Track commitment timestamps"],
    timeHorizon: { window: "14d", rationale: "Covers recent commitments and overdue replies" },
    subjectivityScore: 0.6,
    heuristics,
    requiredEntities: { integrations: [], objects: [], filters: [] },
    forbiddenOutputs: [],
    acceptableFallbacks: ["Show unanswered items only", "Ask for missing integrations"],
  };
}

async function applySemanticPlan(spec: ToolSystemSpec, prompt: string): Promise<ToolSystemSpec> {
  if (!spec.intent_contract) {
    throw new Error("Semantic plan requires intent contract");
  }
  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON only: {"steps":[{"id":string,"description":string,"capabilityId":string?,"requires":[string]}],"success_criteria":[string],"join_graph":[{"from":string,"to":string,"on":string}]}.`,
      },
      { role: "user", content: JSON.stringify({ prompt, intent: spec.intent_contract }) },
    ],
    temperature: 0,
    max_tokens: 450,
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Semantic plan required but invalid");
  }
  let parsed;
  try {
    parsed = SemanticPlanSchema.safeParse(JSON.parse(content));
  } catch {
    throw new Error("Semantic plan required but invalid");
  }
  if (!parsed.success) {
    throw new Error("Semantic plan required but invalid");
  }
  const plan = parsed.data;
  const next = augmentSpecForIntent(spec, prompt, spec.intent_contract, plan);
  return { ...next, semantic_plan: plan };
}

async function generateGoalPlanWithRetry(prompt: string): Promise<GoalPlan> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await getAzureOpenAIClient().chat.completions.create({
      model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        {
          role: "system",
          content:
            `Return JSON only: {"kind": "DATA_RETRIEVAL" | "TRANSFORMATION" | "PLANNING" | "ANALYSIS", "primary_goal":string,"sub_goals":[string],"constraints":[string],"derived_entities":[{"name":string,"description":string,"fields":[{"name":string,"type":string}]}]}.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
    });
    const content = response.choices[0]?.message?.content;
    if (!content) continue;
    try {
      const parsed = GoalPlanSchema.safeParse(JSON.parse(content));
      if (parsed.success) return parsed.data;
    } catch {
      continue;
    }
  }
  throw new Error("Goal plan required but unavailable");
}

function buildFallbackGoalPlan(prompt: string): GoalPlan {
  const normalized = prompt.trim();
  return {
    kind: "DATA_RETRIEVAL",
    primary_goal: normalized.length > 0 ? normalized : "Retrieve requested data",
    sub_goals: [],
    constraints: [],
    derived_entities: [],
  };
}

function augmentSpecForGoalPlan(spec: ToolSystemSpec, prompt: string, goalPlan: GoalPlan): ToolSystemSpec {
  const normalized = prompt.toLowerCase();
  if (!normalized.includes("build") || !normalized.includes("fail")) {
    return { ...spec, derived_entities: spec.derived_entities ?? [] };
  }
  const derivedEntity = goalPlan.derived_entities.find((entity) => entity.name.toLowerCase().includes("failure"));
  const fields = derivedEntity?.fields.length
    ? derivedEntity.fields
    : [
        { name: "repo", type: "string" },
        { name: "commitSha", type: "string" },
        { name: "failureType", type: "string" },
        { name: "failedAt", type: "string" },
        { name: "emailCount", type: "number" },
        { name: "emails", type: "array" },
      ];
  const derivedEntities: ToolSystemSpec["derived_entities"] = [
    ...(spec.derived_entities ?? []),
    {
      name: derivedEntity?.name ?? "FailureIncident",
      description: derivedEntity?.description ?? "Build failures correlated with related emails",
      fields,
    },
  ];
  const entities: ToolSystemSpec["entities"] = spec.entities.some((entity) => entity.name === "FailureIncident")
    ? spec.entities
    : [
        ...spec.entities,
        {
          name: "FailureIncident",
          sourceIntegration: "github",
          derived: true,
          fields,
          identifiers: ["commitSha"],
          supportedActions: [],
        },
      ];
  const actions = ensureGoalActions(spec.actions);
  const views = ensureGoalViews(spec.views);
  const integrations = ensureGoalIntegrations(spec.integrations, actions);
  return {
    ...spec,
    entities,
    actions,
    views,
    integrations,
    derived_entities: derivedEntities,
  };
}

function augmentSpecForIntent(
  spec: ToolSystemSpec,
  prompt: string,
  contract: IntentContract,
  plan: SemanticPlan,
): ToolSystemSpec {
  const normalized = prompt.toLowerCase();
  const wantsNotionTodos =
    normalized.includes("notion") &&
    (normalized.includes("todo") || normalized.includes("to-do") || normalized.includes("to do"));
  if (!wantsNotionTodos) {
    return { ...spec, intent_contract: contract, semantic_plan: plan };
  }
  const actions = ensureIntentActions(spec.actions);
  const integrations = ensureGoalIntegrations(spec.integrations, actions);
  const fields = [
    { name: "task", type: "string" },
    { name: "completed", type: "boolean" },
    { name: "pageTitle", type: "string" },
    { name: "pageId", type: "string" },
  ];
  const entities: ToolSystemSpec["entities"] = spec.entities.some((entity) => entity.name === "NotionTodo")
    ? spec.entities
    : [
        ...spec.entities,
        {
          name: "NotionTodo",
          sourceIntegration: "notion",
          derived: true,
          fields,
          identifiers: ["task", "pageId"],
          supportedActions: [],
        },
      ];
  const derivedEntities: ToolSystemSpec["derived_entities"] = [
    ...(spec.derived_entities ?? []),
    {
      name: "NotionTodo",
      description: "Notion to-do tasks filtered by intent constraints",
      fields,
    },
  ];
  const views = [
    {
      id: "view.notion.todos",
      name: "Notion To-dos",
      type: "table" as const,
      source: { entity: "NotionTodo", statePath: "derived.notion_todos" },
      fields: ["task", "completed", "pageTitle"],
      actions: ["notion.todos.derive"],
    },
  ];
  return {
    ...spec,
    entities,
    actions,
    views,
    integrations,
    derived_entities: derivedEntities,
    intent_contract: contract,
    semantic_plan: plan,
  };
}

function ensureGoalActions(actions: ToolSystemSpec["actions"]) {
  const next = [...actions];
  const ensure = (id: string, integrationId: IntegrationId, capabilityId: string, name: string) => {
    if (next.some((action) => action.id === id)) return;
    next.push({
      id,
      name,
      description: name,
      type: "READ",
      integrationId,
      capabilityId,
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    });
  };
  ensure("github.repos.list", "github", "github_repos_list", "List repositories");
  ensure("github.commits.list", "github", "github_commits_list", "List commits");
  ensure("github.commit.status", "github", "github_commit_status_list", "List commit status");
  ensure("google.gmail.search", "google", "google_gmail_list", "Search Gmail");
  ensure("github.failure.incidents", "github", "github_commit_status_list", "Derive failure incidents");
  return next;
}

function ensureIntentActions(actions: ToolSystemSpec["actions"]) {
  const next = [...actions];
  const ensure = (id: string, integrationId: IntegrationId, capabilityId: string, name: string) => {
    if (next.some((action) => action.id === id)) return;
    next.push({
      id,
      name,
      description: name,
      type: "READ",
      integrationId,
      capabilityId,
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    });
  };
  ensure("notion.pages.search", "notion", "notion_pages_search", "Search Notion pages");
  ensure("notion.blocks.list", "notion", "notion_block_children_list", "List Notion blocks");
  ensure("notion.todos.derive", "notion", "notion_block_children_list", "Derive Notion to-dos");
  return next;
}

function ensureGoalIntegrations(
  integrations: ToolSystemSpec["integrations"],
  actions: ToolSystemSpec["actions"]
) {
  const ids = new Set(integrations.map((integration) => integration.id));
  const next = [...integrations];
  for (const action of actions) {
    if (ids.has(action.integrationId)) continue;
    ids.add(action.integrationId);
    next.push({ id: action.integrationId, capabilities: [] });
  }
  return next;
}

function ensureGoalViews(views: ToolSystemSpec["views"]): ToolSystemSpec["views"] {
  return [
    {
      id: "view.failure.incidents",
      name: "Contexto Build Failures",
      type: "table" as const,
      source: { entity: "FailureIncident", statePath: "derived.failure_incidents" },
      fields: ["repo", "commitSha", "failureType", "failedAt", "emailCount", "emails"],
      actions: ["github.failure.incidents"],
    },
  ];
}

async function applyAnswerContract(spec: ToolSystemSpec, prompt: string): Promise<ToolSystemSpec> {
  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON only: {"entity_type":string,"required_constraints":[{"field":string,"operator":"semantic_contains","value":string}],"failure_policy":"empty_over_incorrect"}.`,
      },
      { role: "user", content: prompt },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Answer contract required but invalid");
  }
  let parsed;
  try {
    parsed = AnswerContractSchema.safeParse(JSON.parse(content));
  } catch {
    throw new Error("Answer contract required but invalid");
  }
  if (!parsed.success) {
    throw new Error("Answer contract required but invalid");
  }
  const normalizedPrompt = prompt.toLowerCase();
  const contract = parsed.data;
  const isEmail = contract.entity_type.toLowerCase() === "email";
  const wantsLatest =
    normalizedPrompt.includes("latest") ||
    normalizedPrompt.includes("recent") ||
    normalizedPrompt.includes("newest") ||
    normalizedPrompt.includes("most recent");
  const resultShape =
    isEmail && wantsLatest
      ? {
          kind: "list" as const,
          fields: contract.result_shape?.fields ?? [],
          order_by: contract.result_shape?.order_by ?? "internalDate",
          order_direction: contract.result_shape?.order_direction ?? "desc",
          limit: contract.result_shape?.limit ?? 10,
        }
      : contract.result_shape;
  const queryPlans = buildQueryPlansForContract(spec, contract);
  if (queryPlans.length === 0) {
    throw new Error("Answer contract required but query plans missing");
  }
  const toolGraph = buildToolGraphForContract(queryPlans);
  return {
    ...spec,
    answer_contract: resultShape ? { ...contract, result_shape: resultShape } : contract,
    query_plans: queryPlans,
    tool_graph: toolGraph,
  };
}

function buildQueryPlansForContract(spec: ToolSystemSpec, contract: AnswerContract): IntegrationQueryPlan[] {
  const constraint = contract.required_constraints[0];
  if (!constraint) return [];
  const queryPlans: IntegrationQueryPlan[] = [];
  for (const action of spec.actions) {
    if (action.type !== "READ") continue;
    if (action.integrationId === "google") {
      queryPlans.push({
        integrationId: action.integrationId,
        actionId: action.id,
        query: { q: constraint.value, maxResults: 50 },
        fields: ["from", "subject", "snippet", "date"],
        max_results: 50,
      });
      continue;
    }
    queryPlans.push({
      integrationId: action.integrationId,
      actionId: action.id,
      query: {},
      fields: [],
    });
  }
  return queryPlans;
}

function buildToolGraphForContract(queryPlans: IntegrationQueryPlan[]): ToolGraph {
  const nodes = queryPlans.map((plan) => ({
    id: `query.${plan.integrationId}.${plan.actionId}`,
    type: "QueryNode",
    inputs: [],
    outputs: [`data.${plan.actionId}`],
    config: plan,
  }));
  const filterNode = {
    id: "filter.contract",
    type: "FilterNode",
    inputs: nodes.map((node) => node.outputs[0]),
    outputs: ["data.filtered"],
    config: {},
  };
  const viewNode = {
    id: "view.output",
    type: "ViewNode",
    inputs: ["data.filtered"],
    outputs: ["ui.view"],
    config: {},
  };
  const edges = nodes.map((node) => ({ from: node.id, to: filterNode.id }));
  edges.push({ from: filterNode.id, to: viewNode.id });
  return { nodes: [...nodes, filterNode, viewNode], edges };
}

function shouldUseSemanticPlannerLoop(spec: ToolSystemSpec, prompt: string) {
  const normalized = prompt.toLowerCase();
  return (
    (spec.goal_plan && normalized.includes("build") && normalized.includes("fail") && normalized.includes("commit")) ||
    (spec.intent_contract && normalized.includes("notion") && (normalized.includes("todo") || normalized.includes("to-do") || normalized.includes("to do")))
  );
}

async function runSemanticExecutorLoop(params: {
  spec: ToolSystemSpec;
  compiledTool: CompiledToolArtifact;
  orgId: string;
  toolId: string;
  userId?: string | null;
  prompt: string;
}) {
  if (isNotionTodoPrompt(params.prompt)) {
    return runNotionTodoLoop(params);
  }
  return runPlannerExecutorLoop(params);
}

async function runPlannerExecutorLoop(params: {
  spec: ToolSystemSpec;
  compiledTool: CompiledToolArtifact;
  orgId: string;
  toolId: string;
  userId?: string | null;
  prompt: string;
}) {
  const { spec, compiledTool, orgId, toolId, userId } = params;
  const keyword = spec.answer_contract?.required_constraints?.[0]?.value?.toLowerCase() ?? "";
  const repoAction = findActionByCapability(spec, "github_repos_list");
  const commitAction = findActionByCapability(spec, "github_commits_list");
  const statusAction = findActionByCapability(spec, "github_commit_status_list");
  const gmailAction = findActionByCapability(spec, "google_gmail_list");
  const derivedAction = spec.actions.find((action) => action.id === "github.failure.incidents");

  if (!repoAction || !commitAction || !statusAction || !gmailAction || !derivedAction) {
    throw new Error("Goal planner missing required actions");
  }

  const reposResult = await executeToolAction({
    orgId,
    toolId,
    compiledTool,
    actionId: repoAction.id,
    input: { limit: 20 },
    userId,
    triggerId: "planner_loop",
    recordRun: true,
  });
  const repos = Array.isArray(reposResult.output) ? reposResult.output : [];
  const filteredRepos = keyword
    ? repos.filter((repo: any) => String(repo?.name ?? "").toLowerCase().includes(keyword))
    : repos;
  const repoBatch = filteredRepos.length > 0 ? filteredRepos : repos;

  const failures: Array<{
    repo: string;
    commitSha: string;
    failureType: string;
    failedAt: string;
    commitMessage: string;
  }> = [];

  for (const repo of repoBatch.slice(0, 10)) {
    const owner = repo?.owner?.login ?? repo?.owner?.name ?? repo?.full_name?.split("/")?.[0];
    const repoName = repo?.name ?? repo?.full_name?.split("/")?.[1];
    if (!owner || !repoName) continue;
    const commitsResult = await executeToolAction({
      orgId,
      toolId,
      compiledTool,
      actionId: commitAction.id,
      input: { owner, repo: repoName, limit: 20 },
      userId,
      triggerId: "planner_loop",
      recordRun: true,
    });
    const commits = Array.isArray(commitsResult.output) ? commitsResult.output : [];
    for (const commit of commits.slice(0, 10)) {
      const sha = String(commit?.sha ?? "");
      if (!sha) continue;
      const message = String(commit?.commit?.message ?? "");
      if (keyword && !message.toLowerCase().includes(keyword) && !repoName.toLowerCase().includes(keyword)) {
        continue;
      }
      const statusResult = await executeToolAction({
        orgId,
        toolId,
        compiledTool,
        actionId: statusAction.id,
        input: { owner, repo: repoName, sha },
        userId,
        triggerId: "planner_loop",
        recordRun: true,
      });
      const status = statusResult.output ?? {};
      if (!isFailureStatus(status)) continue;
      failures.push({
        repo: repoName,
        commitSha: sha,
        failureType: status?.state ?? "failure",
        failedAt: status?.updated_at ?? commit?.commit?.author?.date ?? new Date().toISOString(),
        commitMessage: message,
      });
    }
  }

  const emailsByFailure = new Map<string, Array<Record<string, any>>>();
  let totalEmails = 0;
  let relatedEmails = 0;
  if (failures.length > 0) {
    for (const failure of failures) {
      const query = keyword ? `${keyword} ${failure.commitSha}` : failure.commitSha;
      const gmailResult = await executeToolAction({
        orgId,
        toolId,
        compiledTool,
        actionId: gmailAction.id,
        input: { q: query, maxResults: 50 },
        userId,
        triggerId: "planner_loop",
        recordRun: true,
      });
      const normalized = normalizeEmailRows(gmailResult.output);
      totalEmails += normalized.length;
      const related = normalized.filter((email) =>
        matchesFailureEmail(email, failure, keyword)
      );
      relatedEmails += related.length;
      emailsByFailure.set(failure.commitSha, related);
    }
  }

  const incidents = failures.map((failure) => {
    const emails = emailsByFailure.get(failure.commitSha) ?? [];
    return {
      repo: failure.repo,
      commitSha: failure.commitSha,
      failureType: failure.failureType,
      failedAt: failure.failedAt,
      emailCount: emails.length,
      emails,
    };
  });

  return {
    outputs: [{ action: derivedAction, output: incidents }],
    evidence: {
      failed_commits: failures.length,
      failure_incidents: incidents.length,
      related_emails: relatedEmails,
      total_emails: totalEmails,
    },
  };
}

async function runNotionTodoLoop(params: {
  spec: ToolSystemSpec;
  compiledTool: CompiledToolArtifact;
  orgId: string;
  toolId: string;
  userId?: string | null;
  prompt: string;
}) {
  const { spec, compiledTool, orgId, toolId, userId, prompt } = params;
  const pagesAction = findActionByCapability(spec, "notion_pages_search");
  const blocksAction = findActionByCapability(spec, "notion_block_children_list");
  const derivedAction = spec.actions.find((action) => action.id === "notion.todos.derive");
  if (!pagesAction || !blocksAction || !derivedAction) {
    throw new Error("Semantic planner missing Notion actions");
  }
  const keyword = extractNotionKeyword(prompt, spec.intent_contract);
  const pagesResult = await executeToolAction({
    orgId,
    toolId,
    compiledTool,
    actionId: pagesAction.id,
    input: { query: keyword },
    userId,
    triggerId: "semantic_loop",
    recordRun: true,
  });
  const pages = Array.isArray(pagesResult.output) ? pagesResult.output : [];
  const selectedPage = selectNotionPage(pages, keyword);
  if (!selectedPage) {
    return { outputs: [{ action: derivedAction, output: [] }], evidence: null };
  }
  const blocksResult = await executeToolAction({
    orgId,
    toolId,
    compiledTool,
    actionId: blocksAction.id,
    input: { blockId: selectedPage.id },
    userId,
    triggerId: "semantic_loop",
    recordRun: true,
  });
  const blocks = Array.isArray(blocksResult.output) ? blocksResult.output : [];
  const pageTitle = extractNotionTitle(selectedPage) ?? "Untitled";
  const todos = blocks
    .filter((block) => block?.type === "to_do" || block?.type === "to_do")
    .map((block) => ({
      task: extractNotionTodoText(block),
      completed: Boolean(block?.to_do?.checked),
      pageTitle,
      pageId: selectedPage.id,
    }))
    .filter((row) => row.task.length > 0);
  return { outputs: [{ action: derivedAction, output: todos }], evidence: null };
}

function isNotionTodoPrompt(prompt: string) {
  const normalized = prompt.toLowerCase();
  return normalized.includes("notion") && (normalized.includes("todo") || normalized.includes("to-do") || normalized.includes("to do"));
}

function isSlackRequired(prompt: string, intent?: IntentContract) {
  if (intent?.requiredEntities?.integrations?.some((id) => id.toLowerCase() === "slack")) return true;
  const normalized = prompt.toLowerCase();
  if (normalized.includes("slack")) return true;
  if (normalized.includes("correlate") && normalized.includes("slack")) return true;
  return false;
}

function extractNotionKeyword(prompt: string, intent?: IntentContract) {
  if (intent?.requiredEntities?.filters?.length) {
    const match = intent.requiredEntities.filters.join(" ").match(/title contains ['"](.+?)['"]/i);
    if (match?.[1]) return match[1];
  }
  const quoted = prompt.match(/["“”']([^"“”']+)["“”']/);
  if (quoted?.[1]) return quoted[1];
  if (prompt.toLowerCase().includes("assemblr")) return "assemblr";
  return prompt.split(" ").slice(0, 3).join(" ");
}

function selectNotionPage(pages: Array<any>, keyword: string) {
  if (pages.length === 0) return null;
  const normalized = keyword.toLowerCase();
  let best = pages[0];
  let bestScore = -1;
  for (const page of pages) {
    const title = extractNotionTitle(page)?.toLowerCase() ?? "";
    let score = 0;
    if (normalized && title.includes(normalized)) score += 2;
    if (title) score += 1;
    const edited = page?.last_edited_time ? Date.parse(page.last_edited_time) : 0;
    score += edited ? edited / 1e13 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = page;
    }
  }
  return best;
}

function extractNotionTitle(page: any) {
  const props = page?.properties ?? {};
  for (const value of Object.values(props)) {
    if (value && typeof value === "object" && (value as any).type === "title") {
      const title = (value as any).title ?? [];
      if (Array.isArray(title)) {
        return title.map((t: any) => t?.plain_text ?? "").join("").trim();
      }
    }
  }
  if (typeof page?.title === "string") return page.title;
  if (typeof page?.name === "string") return page.name;
  return "";
}

function extractNotionTodoText(block: any) {
  const rich = block?.to_do?.rich_text ?? [];
  if (!Array.isArray(rich)) return "";
  return rich.map((t: any) => t?.plain_text ?? "").join("").trim();
}

async function updateIntegrationConnectionStatus(orgId: string, integrationId: string, status: string) {
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    await (admin.from("integration_connections") as any)
      .update({ status })
      .eq("org_id", orgId)
      .eq("integration_id", integrationId);
  } catch (err) {
    console.error("[IntegrationStatus] Failed to update connection status", err);
  }
}

function findActionByCapability(spec: ToolSystemSpec, capabilityId: string) {
  return spec.actions.find((action) => action.capabilityId === capabilityId);
}

function isFailureStatus(status: any) {
  const state = String(status?.state ?? "").toLowerCase();
  if (state === "failure" || state === "error") return true;
  const statuses = Array.isArray(status?.statuses) ? status.statuses : [];
  return statuses.some((entry: any) => {
    const s = String(entry?.state ?? "").toLowerCase();
    return s === "failure" || s === "error";
  });
}

function normalizeEmailRows(output: any): Array<Record<string, any>> {
  if (Array.isArray(output)) {
    return output.map((row) => normalizeEmailRow(row) ?? row).filter(Boolean) as Array<Record<string, any>>;
  }
  return [];
}

function normalizeEmailRow(row: any): Record<string, any> | null {
  if (!row || typeof row !== "object") return null;
  if ("subject" in row || "snippet" in row) return row as Record<string, any>;
  const headers = Array.isArray(row?.payload?.headers) ? row.payload.headers : [];
  if (headers.length === 0) return null;
  const findHeader = (name: string) =>
    headers.find((h: any) => String(h?.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "";
  return {
    from: findHeader("from"),
    subject: findHeader("subject"),
    snippet: row?.snippet ?? "",
    date: findHeader("date") || "",
    body: row?.snippet ?? "",
  };
}

function matchesFailureEmail(email: Record<string, any>, failure: { repo: string; commitSha: string }, keyword: string) {
  const subject = String(email.subject ?? "").toLowerCase();
  const snippet = String(email.snippet ?? "").toLowerCase();
  const combined = `${subject} ${snippet}`.toLowerCase();
  if (keyword && !combined.includes(keyword.toLowerCase())) return false;
  return combined.includes(failure.commitSha.toLowerCase()) || combined.includes(failure.repo.toLowerCase());
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


async function runRefinementAgent(
  spec: ToolSystemSpec,
  onUsage?: (usage?: { total_tokens?: number }) => Promise<void> | void,
): Promise<string[]> {
  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content: `Suggest optional refinements for this tool in JSON: {"suggestions": string[]}.`,
      },
      { role: "user", content: JSON.stringify({ purpose: spec.purpose, integrations: spec.integrations.map((i) => i.id) }) },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  await onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (!content) return [];
  try {
    const json = JSON.parse(content);
    if (Array.isArray(json.suggestions)) {
      return json.suggestions.filter((s: any) => typeof s === "string");
    }
  } catch {
    return [];
  }
  return [];
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function runWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  timeoutMs = 15000,
  backoffMs = 1000
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < retries; i++) {
    try {
      return await withTimeout(fn(), timeoutMs, "Timeout exceeded");
    } catch (err) {
      lastError = err;
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

function canonicalizeToolSpec(spec: ToolSystemSpec): ToolSystemSpec {
  // Defensive: Ensure arrays exist to prevent crashes during canonicalization
  if (!spec.actions || !Array.isArray(spec.actions)) {
     console.warn("[Canonicalize] spec.actions missing, defaulting to []", { toolId: spec.id });
     spec.actions = [];
  }
  if (!spec.workflows || !Array.isArray(spec.workflows)) {
      spec.workflows = [];
  }
  if (!spec.triggers || !Array.isArray(spec.triggers)) {
      spec.triggers = [];
  }
  if (!spec.views || !Array.isArray(spec.views)) {
      spec.views = [];
  }
  // Handle state.reducers separately as it's nested
  if (spec.state && (!spec.state.reducers || !Array.isArray(spec.state.reducers))) {
      spec.state.reducers = [];
  }
  if (!spec.description || spec.description.length === 0) {
    spec.description = spec.purpose ?? "Tool description";
  }
  if (!spec.version) {
    spec.version = spec.spec_version ?? TOOL_SPEC_VERSION;
  }
  if (!spec.memory_model) {
    spec.memory_model = spec.memory;
  }
  if (!spec.confidence_level) {
    spec.confidence_level = "medium";
  }

  const actionMap = new Map<string, string>();
  const actionNameMap = new Map<string, string>();
  const capabilityMap = new Map<string, string>();
  const reducerMap = new Map<string, string>();
  const viewMap = new Map<string, string>();
  const workflowMap = new Map<string, string>();
  const triggerMap = new Map<string, string>();
  const normalizeKey = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const resolveActionId = (raw: string) => {
    const direct =
      actionMap.get(raw) ??
      capabilityMap.get(raw) ??
      actionNameMap.get(normalizeKey(raw));
    if (direct) return direct;
    const normalized = normalizeKey(raw);
    for (const [nameKey, actionId] of actionNameMap) {
      if (nameKey.includes(normalized) || normalized.includes(nameKey)) {
        return actionId;
      }
    }
    return raw;
  };

  const actions = spec.actions.map((action) => {
    const cap = getCapability(action.capabilityId);
    const integrationId = (cap?.integrationId ?? action.integrationId) as IntegrationId;
    const canonicalId = `${integrationId}.${action.capabilityId}`;
    actionMap.set(action.id, canonicalId);
    actionNameMap.set(normalizeKey(action.name ?? action.id), canonicalId);
    capabilityMap.set(action.capabilityId, canonicalId);
    const reducerId = action.reducerId ? `reduce.${canonicalId}` : undefined;
    if (action.reducerId) reducerMap.set(action.reducerId, reducerId!);
    const confidence = action.confidence ?? (cap?.allowedOperations.includes("read") ? 0.8 : 0.6);
    const requiresApproval =
      action.requiresApproval ?? !(cap?.allowedOperations.includes("read") ?? true);
    return {
      ...action,
      id: canonicalId,
      integrationId,
      reducerId,
      confidence,
      requiresApproval,
    };
  });

  const reducers = spec.state.reducers.map((reducer) => {
    const id = reducerMap.get(reducer.id) ?? reducer.id;
    return { ...reducer, id };
  });

  const invalidWorkflowRefs: string[] = [];
  const invalidTriggerRefs: string[] = [];
  const invalidViewRefs: string[] = [];
  const actionIdSet = new Set(spec.actions.map((action) => action.id));
  const workflowIdSet = new Set(spec.workflows.map((workflow) => workflow.id));
  for (const workflow of spec.workflows) {
    for (const node of workflow.nodes) {
      if (node.type === "action" && node.actionId && !actionIdSet.has(node.actionId)) {
        const resolved = resolveActionId(node.actionId);
        if (resolved !== node.actionId) {
          invalidWorkflowRefs.push(`${workflow.id}:${node.actionId}`);
        }
      }
    }
  }
  for (const trigger of spec.triggers) {
    if (trigger.actionId && !actionIdSet.has(trigger.actionId)) {
      const resolved = resolveActionId(trigger.actionId);
      if (resolved !== trigger.actionId) {
        invalidTriggerRefs.push(`${trigger.id}:${trigger.actionId}`);
      }
    }
    if (trigger.workflowId && !workflowIdSet.has(trigger.workflowId)) {
      invalidTriggerRefs.push(`${trigger.id}:${trigger.workflowId}`);
    }
  }
  for (const view of spec.views) {
    for (const actionId of view.actions) {
      if (!actionIdSet.has(actionId)) {
        const resolved = resolveActionId(actionId);
        if (resolved !== actionId) {
          invalidViewRefs.push(`${view.id}:${actionId}`);
        }
      }
    }
  }
  if (invalidWorkflowRefs.length > 0 || invalidTriggerRefs.length > 0 || invalidViewRefs.length > 0) {
    const details = [
      invalidWorkflowRefs.length > 0 ? `workflows=${invalidWorkflowRefs.join(", ")}` : null,
      invalidTriggerRefs.length > 0 ? `triggers=${invalidTriggerRefs.join(", ")}` : null,
      invalidViewRefs.length > 0 ? `views=${invalidViewRefs.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    throw new Error(`Action/workflow ids must match action ids exactly: ${details}`);
  }

  const workflows = spec.workflows.map((workflow, index) => {
    const canonicalId = `workflow.${index + 1}`;
    workflowMap.set(workflow.id, canonicalId);
    return {
      ...workflow,
      id: canonicalId,
      nodes: workflow.nodes.map((node) => ({
        ...node,
        actionId: node.actionId ? resolveActionId(node.actionId) : undefined,
      })),
    };
  });

  const triggers = spec.triggers.map((trigger, index) => {
    const canonicalId = `trigger.${index + 1}`;
    triggerMap.set(trigger.id, canonicalId);
    return {
      ...trigger,
      id: canonicalId,
      actionId: trigger.actionId ? resolveActionId(trigger.actionId) : undefined,
      workflowId: trigger.workflowId ? workflowMap.get(trigger.workflowId) ?? trigger.workflowId : undefined,
    };
  });

  const views = spec.views.map((view, index) => {
    const canonicalId = `view.${index + 1}`;
    viewMap.set(view.id, canonicalId);
    return {
      ...view,
      id: canonicalId,
      actions: view.actions.map(
        (id) => resolveActionId(id),
      ),
    };
  });

  const baseGraph = spec.stateGraph ?? spec.state.graph;
  const graphNodes = baseGraph.nodes.map((node) => ({
    ...node,
    id: actionMap.get(node.id) ?? reducerMap.get(node.id) ?? workflowMap.get(node.id) ?? node.id,
  }));
  const graphEdges = baseGraph.edges.map((edge) => ({
    ...edge,
    from: actionMap.get(edge.from) ?? reducerMap.get(edge.from) ?? workflowMap.get(edge.from) ?? edge.from,
    to: actionMap.get(edge.to) ?? reducerMap.get(edge.to) ?? workflowMap.get(edge.to) ?? edge.to,
    actionId: edge.actionId ? actionMap.get(edge.actionId) ?? edge.actionId : undefined,
    workflowId: edge.workflowId ? workflowMap.get(edge.workflowId) ?? edge.workflowId : undefined,
  }));

  const defaultCapabilities = {
    canRunWithoutUI: true,
    supportedTriggers: spec.triggers.map((t) => t.type),
    maxFrequency: 1440,
    safetyConstraints: ["approval_required_for_writes"],
  };
  const legacyCapabilities = (spec as any).automationCapabilities;
  const automations = spec.automations ?? {
    enabled: true,
    capabilities: legacyCapabilities ?? defaultCapabilities,
  };
  const integrationIds = new Set(
    [
      ...spec.integrations.map((i) => i.id),
      ...spec.actions.map((action) => action.integrationId).filter(Boolean),
    ] as IntegrationId[],
  );
  const integrations = Array.from(integrationIds).map((id) => ({
    id,
    capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
  }));

  return {
    ...spec,
    name: spec.name || spec.purpose,
    entities: [...spec.entities]
      .map((entity) => ({
        ...entity,
        confidence: entity.confidence ?? 0.8,
        identifiers: entity.identifiers ?? [],
        supportedActions: entity.supportedActions ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    actions,
    workflows,
    triggers,
    views,
    derived_entities: spec.derived_entities ?? [],
    query_plans: spec.query_plans ?? [],
    integrations,
    automations,
    observability: spec.observability ?? {
      executionTimeline: true,
      recentRuns: true,
      errorStates: true,
      integrationHealth: true,
      manualRetryControls: true,
    },
    stateGraph: { nodes: graphNodes, edges: graphEdges },
    state: {
      ...spec.state,
      reducers,
      graph: {
        nodes: graphNodes,
        edges: graphEdges,
      },
    },
  };
}

function buildFallbackToolSpec(
  prompt: string,
  integrations: Array<ToolSystemSpec["integrations"][number]["id"]>,
): ToolSystemSpec {
  const normalized: IntegrationId[] = (integrations.length > 0 ? integrations : ["google"]) as IntegrationId[];
  const id = createHash("sha256").update(prompt).digest("hex");
  const name = prompt.split("\n")[0]?.slice(0, 60) || "Tool";
  const actions = normalized.map((integration): ToolSystemSpec["actions"][number] => {
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
        reducerId: "set_emails",
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
        reducerId: "set_repos",
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
        reducerId: "set_issues",
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
        reducerId: "set_messages",
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
      reducerId: "set_pages",
      writesToState: false,
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
    name,
    description: prompt,
    purpose: prompt,
    version: TOOL_SPEC_VERSION,
    spec_version: TOOL_SPEC_VERSION,
    created_at: new Date().toISOString(),
    source_prompt: prompt,
    entities,
    stateGraph: {
      nodes: [
        ...reducers.map((r) => ({ id: r.id, kind: "state" as const })),
        ...actions.map((a) => ({ id: a.id, kind: "action" as const })),
      ],
      edges: actions
        .filter((a) => a.reducerId)
        .map((a) => ({ from: a.id, to: a.reducerId!, actionId: a.id })),
    },
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
    derived_entities: [],
    query_plans: [],
    permissions: { roles: [{ id: "owner", name: "Owner" }], grants: [] },
    integrations: normalized.map((id) => ({
      id,
      capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
    })),
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
console.log("tool-chat exports loaded");
