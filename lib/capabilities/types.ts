export type CapabilityActionType =
    | "list"
    | "get"
    | "create"
    | "update"
    | "delete"
    | "search"
    | "other";

export type CapabilityOperation = "read" | "write" | "aggregate" | "filter" | "group";

export interface Capability {
    id: string; // Unique ID (e.g. "github_issues_list")
    integrationId: string;
    name: string;
    description: string;
    type: CapabilityActionType;
    parameters: any; // JSON Schema for parameters (Object or Array)
    originalActionId: string; // ID in Composio (or other provider)

    // Legacy compatibility fields
    resource?: string;
    allowedOperations?: CapabilityOperation[];
    supportedFields?: string[];
}
