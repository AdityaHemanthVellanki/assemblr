export type PlannerContext = {
  integrations: Record<string, {
    connected: boolean;
    capabilities: string[]; // List of capability IDs
    scopes?: string[];
  }>;
};
