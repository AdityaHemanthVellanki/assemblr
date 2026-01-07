export type CompiledIntent = {
  intent_type: "chat" | "create" | "modify" | "analyze";
  system_goal: string;
  constraints: string[];
  integrations_required: string[];
  output_mode: "text" | "mini_app";
  execution_policy: {
    deterministic: boolean;
    parallelizable: boolean;
    retries: number;
  };
  // Optional payload for create/modify
  tool_mutation?: {
    pagesAdded?: any[];
    componentsAdded?: any[];
    actionsAdded?: any[];
    stateAdded?: Record<string, any>;
  };
  tasks?: Array<{
    id: string;
    capabilityId: string;
    params: Record<string, any>;
  }>;
};
