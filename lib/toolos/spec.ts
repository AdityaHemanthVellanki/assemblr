import { z } from "zod";
export const TOOL_SPEC_VERSION = 1;
export const IntegrationIdSchema = z.enum(["google", "github", "slack", "notion", "linear", "hubspot", "stripe", "intercom", "salesforce", "zendesk", "airtable", "asana", "clickup", "jira", "gitlab", "bitbucket", "microsoft_teams", "outlook", "quickbooks", "google_analytics", "zoom", "discord", "trello"]);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;

export const CanonicalEntitySchema = z.enum(["Issue", "Email", "Message", "Page", "Repo", "Ticket"]);
export type CanonicalEntity = z.infer<typeof CanonicalEntitySchema>;

export const EntityFieldSchema = z.object({
  name: z.string().min(1).default("Tool"),
  type: z.string().min(1),
  required: z.boolean().optional(),
});
export type EntityField = z.infer<typeof EntityFieldSchema>;

export const EntityRelationSchema = z.object({
  name: z.string().min(1),
  target: z.string().min(1),
  type: z.enum(["one_to_one", "one_to_many", "many_to_many"]),
});
export type EntityRelation = z.infer<typeof EntityRelationSchema>;

export const EntitySpecSchema = z.object({
  name: z.string().min(1),
  fields: z.array(EntityFieldSchema),
  sourceIntegration: IntegrationIdSchema,
  derived: z.boolean().optional(),
  identifiers: z.array(z.string()).default([]),
  supportedActions: z.array(z.string()).default([]),
  relations: z.array(EntityRelationSchema).optional(),
  behaviors: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confidenceLevel: z.enum(["low", "medium", "high"]).optional(),
});
export type EntitySpec = z.infer<typeof EntitySpecSchema>;

export const StateReducerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["set", "merge", "append", "remove"]),
  target: z.string().min(1),
});
export type StateReducer = z.infer<typeof StateReducerSchema>;

export const StateGraphSchema = z.object({
  nodes: z.array(z.object({ id: z.string().min(1), kind: z.enum(["state", "action", "workflow"]) })),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      actionId: z.string().optional(),
      workflowId: z.string().optional(),
    }),
  ),
});
export type StateGraph = z.infer<typeof StateGraphSchema>;

export const ActionTypeSchema = z.enum(["READ", "WRITE", "MUTATE", "NOTIFY"]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  type: ActionTypeSchema.default("READ"),
  integrationId: IntegrationIdSchema,
  capabilityId: z.string().min(1),
  inputSchema: z.record(z.string(), z.any()).default({}),
  outputSchema: z.record(z.string(), z.any()).default({}),
  reducerId: z.string().optional(),
  writesToState: z.boolean().default(false),
  emits: z.array(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confidenceLevel: z.enum(["low", "medium", "high"]).optional(),
});
export type ActionSpec = z.infer<typeof ActionSpecSchema>;

export const ActionNodeSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
  stepLabel: z.string().optional(),
});
export type ActionNode = z.infer<typeof ActionNodeSchema>;

export const ConditionalEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  condition: z.string().optional(), // JS expression or state path
  type: z.enum(["default", "success", "failure"]).default("default"),
});
export type ConditionalEdge = z.infer<typeof ConditionalEdgeSchema>;

export const ActionGraphSchema = z.object({
  nodes: z.array(ActionNodeSchema),
  edges: z.array(ConditionalEdgeSchema),
});
export type ActionGraph = z.infer<typeof ActionGraphSchema>;

export const WorkflowNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["action", "condition", "transform", "wait"]),
  actionId: z.string().optional(),
  condition: z.string().optional(),
  transform: z.string().optional(),
  waitMs: z.number().optional(),
});
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export const WorkflowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type WorkflowEdge = z.infer<typeof WorkflowEdgeSchema>;

export const WorkflowSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  nodes: z.array(WorkflowNodeSchema),
  edges: z.array(WorkflowEdgeSchema),
  retryPolicy: z.object({ maxRetries: z.number().min(0), backoffMs: z.number().min(0) }),
  timeoutMs: z.number().min(0),
  maxConcurrency: z.number().min(1).default(5),
});
export type WorkflowSpec = z.infer<typeof WorkflowSpecSchema>;

export const TriggerSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.nativeEnum({ cron: "cron", webhook: "webhook", integration_event: "integration_event", state_condition: "state_condition" } as const),
  condition: z.record(z.string(), z.any()).default({}),
  actionId: z.string().optional(),
  workflowId: z.string().optional(),
  enabled: z.boolean().default(true),
});
export type TriggerSpec = z.infer<typeof TriggerSpecSchema>;

export const ViewSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["table", "kanban", "timeline", "chat", "form", "inspector", "command", "detail", "dashboard"]),
  source: z.object({
    entity: z.string().min(1),
    statePath: z.string().min(1),
  }),
  fields: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});
export type ViewSpec = z.infer<typeof ViewSpecSchema>;

export const TimelineEventSchema = z.object({
  timestamp: z.string().datetime(),
  entity: z.string().min(1),
  sourceIntegration: IntegrationIdSchema,
  action: z.string().min(1),
  metadata: z.record(z.string(), z.any()).default({}),
});
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const ClarificationSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  options: z.array(z.string()).optional(),
});
export type Clarification = z.infer<typeof ClarificationSchema>;

export const RoleSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  inherits: z.array(z.string()).optional(),
});
export type RoleSpec = z.infer<typeof RoleSpecSchema>;

export const PermissionSpecSchema = z.object({
  roleId: z.string().min(1),
  scope: z.enum(["entity", "action", "workflow", "view"]),
  targetId: z.string().min(1),
  access: z.enum(["read", "write", "execute", "approve"]),
});
export type PermissionSpec = z.infer<typeof PermissionSpecSchema>;

export const MemorySpecSchema = z.object({
  tool: z.object({
    namespace: z.string().min(1),
    retentionDays: z.number().min(1),
    schema: z.record(z.string(), z.any()).default({}),
  }),
  user: z.object({
    namespace: z.string().min(1),
    retentionDays: z.number().min(1),
    schema: z.record(z.string(), z.any()).default({}),
  }),
});
export type MemorySpec = z.infer<typeof MemorySpecSchema>;

export const IntegrationSpecSchema = z.object({
  id: IntegrationIdSchema,
  capabilities: z.array(z.string()).default([]),
});
export type IntegrationSpec = z.infer<typeof IntegrationSpecSchema>;

export const DataReadinessGateSchema = z.object({
  requiredEntities: z.array(z.string()).default([]),
  minimumRecords: z.number().min(1).default(1),
});
export type DataReadinessGate = z.infer<typeof DataReadinessGateSchema>;

export const AnswerConstraintSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["semantic_contains"]),
  value: z.string().min(1),
});
export type AnswerConstraint = z.infer<typeof AnswerConstraintSchema>;

export const AnswerContractSchema = z.object({
  entity_type: z.string().min(1),
  required_constraints: z.array(AnswerConstraintSchema).default([]),
  failure_policy: z.enum(["empty_over_incorrect"]),
  list_shape: z.enum(["array", "object"]).default("array"),
  result_shape: z
    .object({
      kind: z.enum(["list"]).default("list"),
      fields: z.array(z.string()).default([]),
      order_by: z.string().optional(),
      order_direction: z.enum(["asc", "desc"]).optional(),
      limit: z.number().min(1).optional(),
    })
    .optional(),
});
export type AnswerContract = z.infer<typeof AnswerContractSchema>;

export const DerivedEntitySchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  fields: z.array(z.object({ name: z.string().min(1), type: z.string().min(1) })).default([]),
});
export type DerivedEntity = z.infer<typeof DerivedEntitySchema>;

export const GoalKindSchema = z.enum(["DATA_RETRIEVAL", "TRANSFORMATION", "PLANNING", "ANALYSIS"]);
export type GoalKind = z.infer<typeof GoalKindSchema>;

export const GoalPlanSchema = z.object({
  kind: GoalKindSchema.default("PLANNING"),
  primary_goal: z.string().min(1),
  sub_goals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  derived_entities: z.array(DerivedEntitySchema).default([]),
});
export type GoalPlan = z.infer<typeof GoalPlanSchema>;

export const IntentContractSchema = z.object({
  userGoal: z.string().min(1),
  successCriteria: z.array(z.string()).default([]),
  implicitConstraints: z.array(z.string()).default([]),
  hiddenStateRequirements: z.array(z.string()).default([]),
  timeHorizon: z
    .object({
      window: z.string().min(1),
      rationale: z.string().min(1),
    })
    .optional(),
  subjectivityScore: z.number().min(0).max(1).default(0.5),
  heuristics: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        definition: z.string().min(1),
        tunableParams: z.record(z.string(), z.any()).default({}),
        confidence: z.number().min(0).max(1).default(0.7),
      }),
    )
    .default([]),
  requiredEntities: z.object({
    integrations: z.array(z.string()).default([]),
    objects: z.array(z.string()).default([]),
    filters: z.array(z.string()).default([]),
  }),
  forbiddenOutputs: z.array(z.string()).default([]),
  acceptableFallbacks: z.array(z.string()).default([]),
});
export type IntentContract = z.infer<typeof IntentContractSchema>;

export const SemanticPlanStepSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  capabilityId: z.string().optional(),
  requires: z.array(z.string()).default([]),
});
export const SemanticPlanSchema = z.object({
  steps: z.array(SemanticPlanStepSchema).default([]),
  success_criteria: z.array(z.string()).default([]),
  join_graph: z.array(z.object({ from: z.string().min(1), to: z.string().min(1), on: z.string().min(1) })).default([]),
});
export type SemanticPlan = z.infer<typeof SemanticPlanSchema>;

export const AbsenceReasonSchema = z.enum([
  "no_failed_builds",
  "failed_builds_exist_no_notifications",
  "emails_exist_not_related",
  "integration_permission_missing",
  "ambiguous_query",
  "no_data_found",
]);
export type AbsenceReason = z.infer<typeof AbsenceReasonSchema>;

export const GoalSatisfactionSchema = z.object({
  level: z.enum(["satisfied", "partial", "unsatisfied"]),
  satisfied: z.boolean(),
  confidence: z.number().min(0).max(1),
  failure_reason: z.string().optional(),
  missing_requirements: z.array(z.string()).optional(),
  absence_reason: AbsenceReasonSchema.optional(),
});
export type GoalSatisfactionResult = z.infer<typeof GoalSatisfactionSchema>;

export const DecisionSchema = z.object({
  kind: z.enum(["render", "explain", "ask"]),
  explanation: z.string().optional(),
  question: z.string().optional(),
  partial: z.boolean().optional(),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const IntegrationStatusSchema = z.object({
  integration: z.string().min(1),
  status: z.enum(["ok", "skipped", "reauth_required", "failed"]),
  reason: z.string().optional(),
  required: z.boolean().optional(),
  userActionRequired: z.boolean().optional(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationQueryPlanSchema = z.object({
  integrationId: IntegrationIdSchema,
  actionId: z.string().min(1),
  query: z.record(z.string(), z.any()).default({}),
  fields: z.array(z.string()).default([]),
  max_results: z.number().min(1).optional(),
});
export type IntegrationQueryPlan = z.infer<typeof IntegrationQueryPlanSchema>;

export const ToolGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  inputs: z.array(z.string()).default([]),
  outputs: z.array(z.string()).default([]),
  config: z.record(z.string(), z.any()).default({}),
});
export type ToolGraphNode = z.infer<typeof ToolGraphNodeSchema>;

export const ToolGraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});
export type ToolGraphEdge = z.infer<typeof ToolGraphEdgeSchema>;

export const ToolGraphSchema = z.object({
  nodes: z.array(ToolGraphNodeSchema).default([]),
  edges: z.array(ToolGraphEdgeSchema).default([]),
});
export type ToolGraph = z.infer<typeof ToolGraphSchema>;

export const ViewSpecPayloadSchema = z.object({
  views: z.array(ViewSpecSchema),
  goal_plan: GoalPlanSchema.optional(),
  intent_contract: IntentContractSchema.optional(),
  semantic_plan: SemanticPlanSchema.optional(),
  goal_validation: GoalSatisfactionSchema.optional(),
  decision: DecisionSchema.optional(),
  integration_statuses: z.record(z.string(), IntegrationStatusSchema).optional(),
  answer_contract: AnswerContractSchema.optional(),
  query_plans: z.array(IntegrationQueryPlanSchema).default([]),
  tool_graph: ToolGraphSchema.optional(),
  assumptions: z.array(ClarificationSchema).optional(),
});
export type ViewSpecPayload = z.infer<typeof ViewSpecPayloadSchema>;

export function coerceViewSpecPayload(input: unknown): ViewSpecPayload {
  const parsed = ViewSpecPayloadSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  const base = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, any>) : {};
  const repaired = {
    views: Array.isArray(base.views) ? base.views : [],
    goal_plan: base.goal_plan ?? undefined,
    intent_contract: base.intent_contract ?? undefined,
    semantic_plan: base.semantic_plan ?? undefined,
    goal_validation: base.goal_validation ?? undefined,
    decision: base.decision ?? undefined,
    integration_statuses: base.integration_statuses ?? undefined,
    answer_contract: base.answer_contract ?? undefined,
    query_plans: Array.isArray(base.query_plans) ? base.query_plans : [],
    tool_graph: base.tool_graph ?? undefined,
    assumptions: Array.isArray(base.assumptions) ? base.assumptions : undefined,
  };
  const repairedParsed = ViewSpecPayloadSchema.safeParse(repaired);
  if (repairedParsed.success) return repairedParsed.data;
  return { views: [], query_plans: [] };
}

export const AutomationCapabilitiesSchema = z.object({
  canRunWithoutUI: z.boolean(),
  supportedTriggers: z.array(z.string()).default([]),
  maxFrequency: z.number().min(1),
  safetyConstraints: z.array(z.string()).default([]),
});
export type AutomationCapabilities = z.infer<typeof AutomationCapabilitiesSchema>;

export const AutomationsSpecSchema = z.object({
  enabled: z.boolean().default(true),
  capabilities: AutomationCapabilitiesSchema,
  lastRunAt: z.string().optional(),
  nextRunAt: z.string().optional(),
});
export type AutomationsSpec = z.infer<typeof AutomationsSpecSchema>;

export const ObservabilitySpecSchema = z.object({
  executionTimeline: z.boolean(),
  recentRuns: z.boolean(),
  errorStates: z.boolean(),
  integrationHealth: z.boolean(),
  manualRetryControls: z.boolean(),
});
export type ObservabilitySpec = z.infer<typeof ObservabilitySpecSchema>;

export const ToolLifecycleStateSchema = z.enum([
  "DRAFT",
  "BUILDING",
  "READY",
  "FAILED",
  "FAILED_COMPILATION",
  "TOOL_CREATED",
  "INTEGRATIONS_RUNNING",
  "DATA_COLLECTED",
  "DATA_VALIDATED",
  "RENDER_STATE_READY",
  "VIEW_READY",
  "INIT",
  "INTENT_PARSED",
  "ENTITIES_EXTRACTED",
  "INTEGRATIONS_RESOLVED",
  "ACTIONS_DEFINED",
  "WORKFLOWS_COMPILED",
  "RUNTIME_READY",
  "DATA_FETCHED",
  "ACTIVE",
  "DEGRADED",
  "INFRA_ERROR",
  "NEEDS_CLARIFICATION",
  "AWAITING_CLARIFICATION",
]);
export type ToolLifecycleState = z.infer<typeof ToolLifecycleStateSchema>;

export const InitialFetchSchema = z.object({
  entity: z.string().min(1),
  integrationId: IntegrationIdSchema,
  actionId: z.string().min(1),
  limit: z.number().min(1).default(10),
  order_by: z.string().optional(),
  order_direction: z.enum(["asc", "desc"]).optional(),
});
export type InitialFetch = z.infer<typeof InitialFetchSchema>;

export const ToolSystemSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1).default("Tool description"),
  purpose: z.string().min(1),
  version: z.number().int().min(1).default(TOOL_SPEC_VERSION),
  spec_version: z.number().int().min(1).default(TOOL_SPEC_VERSION),
  created_at: z.string().min(1).optional(),
  source_prompt: z.string().min(1).optional(),
  entities: z.array(EntitySpecSchema),
  stateGraph: StateGraphSchema.optional(), // Deprecated
  actionGraph: ActionGraphSchema.optional(),
  state: z.object({
    initial: z.record(z.string(), z.any()).default({}),
    reducers: z.array(StateReducerSchema).default([]),
    graph: StateGraphSchema,
  }),
  actions: z.array(ActionSpecSchema),
  workflows: z.array(WorkflowSpecSchema).default([]),
  triggers: z.array(TriggerSpecSchema).default([]),
  views: z.array(ViewSpecSchema).default([]),
  permissions: z.object({
    roles: z.array(RoleSpecSchema).default([]),
    grants: z.array(PermissionSpecSchema).default([]),
  }),
  integrations: z.array(IntegrationSpecSchema),
  initialFetch: InitialFetchSchema.optional(),
  dataReadiness: DataReadinessGateSchema.optional(),
  goal_plan: GoalPlanSchema.optional(),
  intent_contract: IntentContractSchema.optional(),
  semantic_plan: SemanticPlanSchema.optional(),
  derived_entities: z.array(DerivedEntitySchema).default([]),
  answer_contract: AnswerContractSchema.optional(),
  query_plans: z.array(IntegrationQueryPlanSchema).default([]),
  tool_graph: ToolGraphSchema.optional(),
  memory: MemorySpecSchema,
  memory_model: MemorySpecSchema.default({
    tool: { namespace: "default", retentionDays: 30, schema: {} },
    user: { namespace: "default", retentionDays: 30, schema: {} },
  }),
  confidence_level: z.enum(["low", "medium", "high"]).default("medium"),
  automations: AutomationsSpecSchema.optional(),
  observability: ObservabilitySpecSchema.optional(),
  clarifications: z.array(ClarificationSchema).optional(),
  lifecycle_state: ToolLifecycleStateSchema.optional(),
  // status: z.enum(["draft", "ready", "active", "error", "needs_auth"]).optional(), // REMOVED: Schema mismatch
  blocked_integrations: z.array(z.string()).optional(),
});
export type ToolSystemSpec = z.infer<typeof ToolSystemSpecSchema>;

export function isToolSystemSpec(value: unknown): value is ToolSystemSpec {
  return ToolSystemSpecSchema.safeParse(value).success;
}

export function createEmptyToolSpec(input?: {
  id?: string;
  name?: string;
  purpose?: string;
  description?: string;
  sourcePrompt?: string;
}): ToolSystemSpec {
  const name = input?.name?.trim() || "New Tool";
  const purpose = input?.purpose?.trim() || "To be defined";
  const description = input?.description?.trim() || purpose;
  const sourcePrompt = input?.sourcePrompt?.trim() || purpose;
  const now = new Date().toISOString();
  const id =
    input?.id ??
    (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `tool_${Date.now()}`);
  const memorySchema = {
    observations: [],
    aggregates: {},
    decay: { halfLifeDays: 14 },
  };
  return {
    id,
    name,
    description,
    purpose,
    version: TOOL_SPEC_VERSION,
    spec_version: TOOL_SPEC_VERSION,
    created_at: now,
    source_prompt: sourcePrompt,
    entities: [],
    state: {
      initial: {},
      reducers: [],
      graph: { nodes: [], edges: [] },
    },
    actions: [],
    workflows: [],
    triggers: [],
    views: [],
    permissions: { roles: [], grants: [] },
    integrations: [],
    derived_entities: [],
    query_plans: [],
    memory: {
      tool: { namespace: id, retentionDays: 30, schema: memorySchema },
      user: { namespace: id, retentionDays: 30, schema: memorySchema },
    },
    memory_model: {
      tool: { namespace: id, retentionDays: 30, schema: memorySchema },
      user: { namespace: id, retentionDays: 30, schema: memorySchema },
    },
    confidence_level: "medium",
    lifecycle_state: "DRAFT",
  };
}
