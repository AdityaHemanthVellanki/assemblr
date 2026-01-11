export type CompiledIntent = {
  intent_type: "chat" | "create" | "execute" | "modify";
  system_goal: string;
  constraints: string[];
  integrations_required: string[]; // IntegrationID[]
  output_mode: "text" | "dashboard" | "mini_app" | "workflow";
  
  // Plane B: Execution Graph (DAG)
  execution_graph: {
    nodes: ExecutionNode[];
    edges: ExecutionEdge[];
  };

  // Plane A: UI Contract (Optional, for Create Mode)
  ui_contract?: UIContract;

  // Legacy support for gradual migration (Optional)
  tool_mutation?: {
    pagesAdded?: any[];
    componentsAdded?: any[];
    actionsAdded?: any[];
    stateAdded?: Record<string, any>;
  };
  
  // Execution Policy
  execution_policy: {
    deterministic: boolean;
    parallelizable: boolean;
    retries: number;
  };
};

export type ExecutionNode = {
  id: string;
  type: "integration_call" | "transform" | "condition" | "emit_event";
  capabilityId?: string; // For integration_call
  params: Record<string, any>;
  guarantees?: {
    deterministic: boolean;
    retry_policy?: {
      max_attempts: number;
      backoff_ms: number;
    };
  };
};

export type ExecutionEdge = {
  from: string;
  to: string;
  condition?: string; // Expression for conditional edges
};

export type UIContract = {
  // Abstract definition of the UI before materialization
  // This allows the planner to reason about UI without writing raw JSON specs immediately
  views: Array<{
    title: string;
    type: "list" | "detail" | "form" | "dashboard";
    data_source_node_id?: string; // Link to Execution Node
  }>;
};
