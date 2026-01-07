import { CompiledIntent } from "./intent";
import { TaskGraph } from "./agent";

export type ExecutionTrace = {
  id: string;
  timestamp: string; // ISO Date
  mode: "create" | "modify" | "run";
  tool_version_id?: string; // Version Scoping
  trigger_id?: string; // Trigger Reference
  compiled_intent?: CompiledIntent;
  task_graph?: TaskGraph;
  agents_invoked: AgentExecution[];
  integrations_accessed: IntegrationAccess[];
  actions_executed: ActionExecution[];
  state_mutations: StateMutation[];
  ui_mutations: UIMutation[];
  outcome: "success" | "failure";
  failure_reason?: string;
};

export type AgentExecution = {
  agentId: string;
  task: string;
  input: any;
  output: any;
  duration_ms: number;
};

export type IntegrationAccess = {
  integrationId: string;
  capabilityId: string;
  params: any;
  status: "success" | "error";
  latency_ms: number;
  metadata?: any; // e.g. specific API endpoint called
};

export type ActionExecution = {
  actionId: string;
  type: string;
  inputs: any;
  status: "success" | "error";
  error?: string;
};

export type StateMutation = {
  key: string;
  oldValue: any;
  newValue: any;
};

export type UIMutation = {
  componentId: string;
  changeType: "added" | "updated" | "removed";
  details: any;
};
