import { OrgPolicy, PolicyEvaluationResult, PolicyRule } from "@/lib/core/governance";

export class PolicyEngine {
  evaluate(policies: OrgPolicy[], context: {
    integrationId?: string;
    capabilityId?: string;
    actionType?: string;
    frequency?: number;
  }): PolicyEvaluationResult {
    // Default allow, unless denied
    // Or default deny? Prompt implies "policies constrain behavior", so default allow but filtered by restrictions.
    // However, for high security, explicit allow is better.
    // Let's assume restrictions are additive "deny" rules for now, or "allowlist" rules.

    for (const policy of policies) {
      for (const rule of policy.rules) {
        const result = this.evaluateRule(rule, context);
        if (!result.allowed) {
          return { 
             allowed: false, 
             reason: `Blocked by policy '${policy.name}': ${result.reason}`,
             blocking_rule: rule
          };
        }
      }
    }

    return { allowed: true };
  }

  private evaluateRule(rule: PolicyRule, context: any): { allowed: boolean; reason?: string } {
    switch (rule.type) {
      case "integration_allowlist":
        if (context.integrationId && !rule.params.integrations.includes(context.integrationId)) {
          return { allowed: false, reason: `Integration ${context.integrationId} not in allowlist` };
        }
        break;
      
      case "capability_allowlist":
         if (context.capabilityId && rule.params.allowed_capabilities && !rule.params.allowed_capabilities.includes(context.capabilityId)) {
             return { allowed: false, reason: `Capability ${context.capabilityId} not in allowlist` };
         }
         break;

      case "max_execution_frequency":
         if (context.frequency && rule.params.max_frequency && context.frequency > rule.params.max_frequency) {
             return { allowed: false, reason: `Execution frequency ${context.frequency} exceeds limit ${rule.params.max_frequency}` };
         }
         break;
    }
    return { allowed: true };
  }
}
