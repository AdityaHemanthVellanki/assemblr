export interface IntentSchema {
  goal: string;
  integration: "google" | "github" | "slack" | "notion" | "linear";
  operation: "read" | "write";
  limit?: number;
  filters?: Record<string, any>;
}
