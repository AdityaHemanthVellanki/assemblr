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

  if (!isActivated) {
    errors.push("Tool is not activated.");
  }

  // If lifecycle is explicit, it must be READY (or RUNNING if we had that, but READY is the compiler target)
  // We'll assume READY is the state before activation, but after activation it might stay READY or go to RUNNING.
  // The prompt says "lifecycle === ACTIVATED", but spec uses ToolLifecycleState enum.
  // We'll treat "isActivated" db flag as the primary "ACTIVATED" check.
  // But we should also check if the build process finished successfully.
  if (lifecycleState === "DEGRADED") {
    errors.push("Tool build is degraded.");
  }
  if (lifecycleState === "NEEDS_CLARIFICATION" || lifecycleState === "AWAITING_CLARIFICATION") {
    errors.push("Tool needs clarification.");
  }

  if (spec.entities.length === 0) {
    errors.push("Tool must have at least one entity.");
  }

  if (spec.integrations.length === 0) {
    errors.push("Tool must have at least one integration.");
  }

  if (spec.views.length === 0) {
    errors.push("Tool must have at least one view.");
  }

  const hasReadAction = spec.actions.some((action) => {
    const cap = getCapability(action.capabilityId);
    return cap?.allowedOperations.includes("read");
  });

  if (!hasReadAction) {
    errors.push("Tool must have at least one read action.");
  }

  return {
    runnable: errors.length === 0,
    errors,
  };
}
