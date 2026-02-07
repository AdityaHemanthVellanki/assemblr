export class IntegrationNotConnectedError extends Error {
  integrationIds: string[];
  blockingActions: string[];
  requiredBy: string[];

  constructor(params: { integrationIds: string[]; blockingActions?: string[]; requiredBy?: string[] }) {
    super(`Integrations not connected: ${params.integrationIds.join(", ")}`);
    this.name = "IntegrationNotConnectedError";
    this.integrationIds = params.integrationIds;
    this.blockingActions = params.blockingActions || [];
    this.requiredBy = params.requiredBy || [];
  }
}

export function isIntegrationNotConnectedError(error: unknown): error is IntegrationNotConnectedError {
  return error instanceof IntegrationNotConnectedError || (error as any)?.name === "IntegrationNotConnectedError";
}

export class IntegrationAuthError extends Error {
  integrationId: string;
  constructor(integrationId: string, message: string) {
    super(`Integration authentication failed for ${integrationId}: ${message}`);
    this.name = "IntegrationAuthError";
    this.integrationId = integrationId;
  }
}
