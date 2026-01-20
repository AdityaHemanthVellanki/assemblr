import { ToolSystemSpec, ToolLifecycleState } from "./spec";
import { getCapability } from "@/lib/capabilities/registry";

export type MRTValidationResult = {
  runnable: boolean;
  errors: string[];
};

export function validateMRT(
  spec: ToolSystemSpec,
  isActivated: boolean,
  lifecycleState?: ToolLifecycleState | null
): MRTValidationResult {
  const errors: string[] = [];

  // 1. RunnableToolInvariant Checks
  // hasEntities === true
  if (!spec.entities || spec.entities.length === 0) {
    errors.push("Invariant Failed: Tool must have at least one entity defined.");
  }

  // hasAtLeastOneReadAction === true
  const hasReadAction = spec.actions.some((action) => {
    const cap = getCapability(action.capabilityId);
    return cap?.allowedOperations.includes("read");
  });
  if (!hasReadAction) {
    errors.push("Invariant Failed: Tool must have at least one READ action.");
  }

  // hasAtLeastOneView === true
  if (!spec.views || spec.views.length === 0) {
    errors.push("Invariant Failed: Tool must have at least one view.");
  }

  // integrationsConnected === true
  // This is a static check on the spec. Runtime checks actual connection status.
  if (!spec.integrations || spec.integrations.length === 0) {
    errors.push("Invariant Failed: Tool must declare at least one integration.");
  }

  // 2. Lifecycle Checks
  if (!isActivated) {
    errors.push("Tool is not activated.");
  }

  if (lifecycleState === "DEGRADED" || lifecycleState === "FAILED") {
    errors.push("Tool build is degraded or failed.");
  }
  
  // Note: NEEDS_CLARIFICATION stops activation, but doesn't necessarily mean the artifact is invalid
  // if we are just checking for runnability. However, the user request says "No partial activation allowed".
  if (lifecycleState === "NEEDS_CLARIFICATION" || lifecycleState === "AWAITING_CLARIFICATION") {
    errors.push("Tool build is incomplete (needs clarification).");
  }

  return {
    runnable: errors.length === 0,
    errors,
  };
}
