
export type IntegrationDefinition = {
    id: string;
    name: string;
    description: string;
    category: string;
    logoUrl?: string;
    authMode: "oauth" | "api_key";
};

export type Connection = {
    id: string;
    integrationId: string;
    orgId: string;
    userId: string;
    status: "active" | "error" | "expired";
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

export type ConnectionResult = {
    success: boolean;
    connection?: Connection;
    error?: string;
};

export type ConnectionHealth = {
    healthy: boolean;
    message?: string;
    lastCheckedAt: string;
};

export type SchemaDefinition = {
    resourceType: string; // e.g., "issue", "repository"
    fields: SchemaField[];
};

export type SchemaField = {
    name: string;
    type: "string" | "number" | "boolean" | "object" | "array" | "date";
    description?: string;
    required?: boolean;
};

export type Capability = {
    id: string;
    integrationId: string;
    resource: string;
    type: "list" | "action" | "query";
    displayName: string;
    description?: string;
    requiredScopes?: string[];
    inputSchema: Record<string, unknown>;
    outputSchema: Record<string, unknown>;
};

export type ScopeValidation = {
    valid: boolean;
    missingScopes: string[];
};

export type ExecutionContext = {
    orgId: string;
    userId: string;
    connectionId: string;
};

export type ActionResult = {
    success: boolean;
    data?: unknown;
    error?: string;
};

export interface IntegrationBroker {
    // Connection Management
    listAvailableIntegrations(): Promise<IntegrationDefinition[]>;
    initiateConnection(orgId: string, userId: string, integrationId: string, returnPath: string, resumeId: string): Promise<{ authUrl: string; state: string; codeVerifier?: string }>;
    resumeConnection(resumeId: string, integrationId: string, code: string, codeVerifier?: string): Promise<ConnectionResult>;
    listConnectedIntegrations(orgId: string): Promise<Connection[]>;
    revokeConnection(orgId: string, integrationId: string): Promise<void>;
    testConnection(orgId: string, integrationId: string): Promise<ConnectionHealth>;

    // Schema & Capability Discovery
    discoverSchemas(orgId: string, integrationId: string): Promise<SchemaDefinition[]>;
    listCapabilities(integrationId: string): Promise<Capability[]>;
    validateScopes(orgId: string, actionId: string): Promise<ScopeValidation>;

    // Execution
    executeAction(actionId: string, params: Record<string, unknown>, context: ExecutionContext): Promise<ActionResult>;
}
