export type PlannerContext = {
  integrations: Record<string, {
    connected: boolean;
    capabilities: string[]; // List of capability IDs
    scopes?: string[];
    health?: {
      tokenValid: boolean;
      error?: string;
      lastCheckedAt?: string;
    };
  }>;
};
