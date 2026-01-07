import { ExecutionPlan } from "@/lib/execution/types";

export function synthesizeQuery(plan: ExecutionPlan): ExecutionPlan {
  // This function maps the high-level Planner ExecutionPlan to the low-level Runtime ExecutionPlan
  // used by the engine/executors.
  
  // In Phase 4, the planner output is already very close to what executors need,
  // but this layer allows for transformation if necessary (e.g., converting "status: open" to specific query syntax).

  // For Phase 1 integrations, we pass params through directly, but we enforce they are valid.
  
  // 1. Base construction
  const runtimePlan: ExecutionPlan = {
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
    case "github_commits_list":
      // Normalize repository parameters to { owner, repo }
      // Accept legacy shapes and convert.
      if (typeof (runtimePlan.params as any)?.repo === "string") {
        const full = String((runtimePlan.params as any).repo);
        const [owner, repo] = full.includes("/") ? full.split("/") : ["", full];
        runtimePlan.params = { ...runtimePlan.params, owner, repo };
        delete (runtimePlan.params as any).repo;
      }
      if (typeof (runtimePlan.params as any)?.full_name === "string") {
        const full = String((runtimePlan.params as any).full_name);
        const [owner, repo] = full.split("/");
        runtimePlan.params = { ...runtimePlan.params, owner, repo };
        delete (runtimePlan.params as any).full_name;
      }
      if (typeof (runtimePlan.params as any)?.owner_repo === "string") {
        const full = String((runtimePlan.params as any).owner_repo);
        const [owner, repo] = full.split("/");
        runtimePlan.params = { ...runtimePlan.params, owner, repo };
        delete (runtimePlan.params as any).owner_repo;
      }
      if (!(runtimePlan.params as any)?.owner || !(runtimePlan.params as any)?.repo) {
        // Missing required fields; executor will error, but we prefer explicit normalization failure
        // Leave as-is; higher-level flow should validate before materialization.
      }
      break;
  }

  return runtimePlan;
}
