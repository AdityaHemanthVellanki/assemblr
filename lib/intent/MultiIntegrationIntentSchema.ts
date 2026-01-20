export type MultiIntegrationToolIntent = {
  title: string;
  description: string;
  sections: ToolSectionIntent[];
};

export type ToolSectionIntent = {
  id: string;
  integration: "google" | "github" | "slack" | "notion" | "linear";
  capabilities: CapabilityInvocationIntent[];
  stateNamespace: string;
  uiLayout: "table" | "list" | "kanban";
};

export type CapabilityInvocationIntent = {
  id: string;
  params?: Record<string, any>;
  operation: "read" | "write";
  limit?: number;
};
