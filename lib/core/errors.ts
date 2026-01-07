export type ExecutionErrorType =
  | "IntegrationAuthError"
  | "CapabilityParamError"
  | "PermissionDeniedError"
  | "PlannerContractError"
  | "RuntimeExecutionError"
  | "UIExecutionError";

export class ExecutionError extends Error {
  type: ExecutionErrorType;
  context?: any;

  constructor(type: ExecutionErrorType, message: string, context?: any) {
    super(message);
    this.name = "ExecutionError";
    this.type = type;
    this.context = context;
  }
}

export class IntegrationAuthError extends ExecutionError {
  constructor(integrationId: string, message: string) {
    super("IntegrationAuthError", `Authentication failed for ${integrationId}: ${message}`, { integrationId });
  }
}

export class PermissionDeniedError extends ExecutionError {
  constructor(integrationId: string, capabilityId: string) {
    super("PermissionDeniedError", `Access denied to capability ${capabilityId} on ${integrationId}`, { integrationId, capabilityId });
  }
}

export class CapabilityParamError extends ExecutionError {
  constructor(capabilityId: string, message: string) {
    super("CapabilityParamError", `Invalid parameters for ${capabilityId}: ${message}`, { capabilityId });
  }
}
