export type IntegrationId = string;

export type EntityType = string;

export interface CapabilityInvocation {
  id: string;
  actionId: string;
  params: Record<string, any>;
}

export interface ToolSection {
  id: string;
  integration: IntegrationId;
  capabilities: CapabilityInvocation[];
  stateNamespace: string;
  uiLayout: "table" | "list" | "kanban";
  execution: {
    mode: "read" | "write";
    defaultLimit: number;
    maxLimit: number;
  };
  entityType: EntityType;
  state: {
    data: string;
    loading: string;
    error: string;
  };
}

export interface CompiledTool {
  toolId: string;
  title: string;
  description: string;
  sections: ToolSection[];
}

export function isCompiledTool(value: any): value is CompiledTool {
  return (
    value &&
    typeof value === "object" &&
    typeof value.toolId === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.sections)
  );
}
