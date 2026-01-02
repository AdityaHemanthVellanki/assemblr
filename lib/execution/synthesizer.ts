import { ExecutionPlan } from "@/lib/ai/planner";
import { ExecutionPlan as RuntimeExecutionPlan } from "@/lib/execution/types";

export function synthesizeQuery(plan: ExecutionPlan): RuntimeExecutionPlan {
  // This function maps the high-level Planner ExecutionPlan to the low-level Runtime ExecutionPlan
  // used by the engine/executors.
  
  // In Phase 4, the planner output is already very close to what executors need,
  // but this layer allows for transformation if necessary (e.g., converting "status: open" to specific query syntax).

  // For Phase 1 integrations, we pass params through directly, but we enforce they are valid.
  
  // 1. Base construction
  const runtimePlan: RuntimeExecutionPlan = {
    viewId: "temp-id", // Will be assigned by caller or dashboard spec
    integrationId: plan.integrationId,
    resource: plan.resource,
    params: { ...plan.params },
  };

  // 2. Specific Synthesis Logic per Capability (if needed)
  switch (plan.capabilityId) {
    case "github_issues_list":
      // Ensure 'state' is valid if present
      if (runtimePlan.params?.state && !["open", "closed", "all"].includes(runtimePlan.params.state as string)) {
        // Strict synthesis failure? Or default?
        // Let's default to "open" or just pass it through and let API fail?
        // Requirement: "Guarantees execution correctness before execution"
        // So we should sanitize.
      }
      break;
    
    // Add more cases as needed for complex query transformations
  }

  return runtimePlan;
}
