export type ExecutionPlan = {
  viewId: string;
  integrationId: string;
  resource: string; // e.g., "issues", "messages"
  params?: Record<string, unknown>;
};

export type ExecutionResult = {
  viewId: string;
  status: "success" | "error";
  data?: unknown[];
  error?: string;
  timestamp: string;
  source: string;
};

export type ExecutorInput = {
  plan: ExecutionPlan;
  credentials: Record<string, unknown>;
};

export interface IntegrationExecutor {
  execute(input: ExecutorInput): Promise<ExecutionResult>;
}
