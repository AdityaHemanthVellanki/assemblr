export type ExecutionPlan = {
  viewId: string;
  integrationId: string;
  resource: string; // e.g., "issues", "messages"
  params?: Record<string, unknown>;
  mode?: "create" | "chat";
};

export type ExecutionResult = {
  viewId: string;
  status: "success" | "error" | "clarification_needed";
  rows: unknown[]; // Strict contract: Always an array
  columns?: unknown[];
  error?: string;
  render_hint?: "list" | "table" | "json" | "text";
  timestamp: string;
  source: "live_api" | "cached" | "joined"; // Strict source
};

export type ExecutorInput = {
  plan: ExecutionPlan;
  credentials: Record<string, unknown>;
};

export interface IntegrationExecutor {
  execute(input: ExecutorInput): Promise<ExecutionResult>;
}
