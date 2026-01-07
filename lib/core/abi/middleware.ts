
import { CapabilityDefinition } from "./types";
import { Permission, checkPermission } from "../permissions";
import { OrgPolicy, PolicyEvaluationResult } from "../governance";
import { PolicyEngine } from "@/lib/governance/engine";
import { PermissionDeniedError } from "../errors";

const policyEngine = new PolicyEngine();

export interface ExecutionContext {
  orgId: string;
  userId?: string;
  permissions: Permission[];
  policies: OrgPolicy[];
  [key: string]: any;
}

export type MiddlewareNext = () => Promise<any>;

export type ExecutionMiddleware = (
  capability: CapabilityDefinition,
  params: any,
  context: ExecutionContext,
  next: MiddlewareNext
) => Promise<any>;

export async function enforcePermissions(
  capability: CapabilityDefinition,
  params: any,
  context: ExecutionContext,
  next: MiddlewareNext
): Promise<any> {
  // 1. Check Basic Permissions (RBAC)
  if (!checkPermission(context.permissions, capability.integrationId, capability.id, capability.mode === "read" ? "read" : "write")) {
    throw new PermissionDeniedError(capability.integrationId, capability.id);
  }
  return next();
}

export async function enforcePolicies(
  capability: CapabilityDefinition,
  params: any,
  context: ExecutionContext,
  next: MiddlewareNext
): Promise<any> {
  // 2. Check Governance Policies (ABAC / Runtime)
  const result: PolicyEvaluationResult = policyEngine.evaluate(context.policies, {
      integrationId: capability.integrationId,
      capabilityId: capability.id,
      actionType: capability.mode === "read" ? "read" : "write",
      // resource: "unknown", // Removed as not supported by PolicyEngine yet
  });

  if (!result.allowed) {
      throw new Error(`Policy Violation: ${result.reason || "Action blocked by organization policy"}`);
  }
  
  return next();
}

import { enforceDeterminism } from "./determinism";

export const standardMiddleware: ExecutionMiddleware[] = [
    enforceDeterminism,
    enforcePermissions,
    enforcePolicies
];
