export interface Intent {
  goal: string;
  integration: {
    provider: "google" | "slack" | "github" | "linear" | "notion";
    capability: string;
  };
  parameters?: Record<string, any>;
  presentation: {
    type: "table" | "list" | "card" | "text";
    fields?: string[];
  };
  refresh?: {
    mode: "onLoad" | "manual";
  };
}
