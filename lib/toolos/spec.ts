import { z } from "zod";
export const IntegrationIdSchema = z.enum(["google", "github", "slack", "notion", "linear"]);
export type IntegrationId = z.infer<typeof IntegrationIdSchema>;

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
  identifiers: z.array(z.string()).default([]),
  supportedActions: z.array(z.string()).default([]),
  relations: z.array(EntityRelationSchema).optional(),
  behaviors: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
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

export const ActionSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  integrationId: IntegrationIdSchema,
  capabilityId: z.string().min(1),
  inputSchema: z.record(z.string(), z.any()).default({}),
  outputSchema: z.record(z.string(), z.any()).default({}),
  reducerId: z.string().optional(),
  emits: z.array(z.string()).optional(),
  requiresApproval: z.boolean().optional(),
  permissions: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type ActionSpec = z.infer<typeof ActionSpecSchema>;

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
  type: z.enum(["table", "kanban", "timeline", "chat", "form", "inspector", "command"]),
  source: z.object({
    entity: z.string().min(1),
    statePath: z.string().min(1),
  }),
  fields: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
});
export type ViewSpec = z.infer<typeof ViewSpecSchema>;

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

export const ToolSystemSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  entities: z.array(EntitySpecSchema),
  stateGraph: StateGraphSchema.optional(),
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
  memory: MemorySpecSchema,
  automations: AutomationsSpecSchema.optional(),
  observability: ObservabilitySpecSchema.optional(),
});
export type ToolSystemSpec = z.infer<typeof ToolSystemSpecSchema>;

export function isToolSystemSpec(value: unknown): value is ToolSystemSpec {
  return ToolSystemSpecSchema.safeParse(value).success;
}
