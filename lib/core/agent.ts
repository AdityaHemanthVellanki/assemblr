export type Agent = {
  id: string;
  domain: string | "synthesis"; // IntegrationId or synthesis
  capabilities: string[]; // CapabilityId[]
  memory_scope: "ephemeral" | "persistent";
  execution_limits: {
    tokens: number;
    calls: number;
  };
};

export type TaskNode = {
  id: string;
  agentId: string;
  capabilityId: string;
  params: Record<string, any>;
  dependencies: string[]; // TaskNode IDs
  status: "pending" | "running" | "completed" | "failed";
  result?: any;
  error?: string;
};

export type TaskGraph = {
  nodes: TaskNode[];
  edges: Array<{ from: string; to: string }>;
  merge_strategy: "reduce" | "compose" | "select_best";
};
