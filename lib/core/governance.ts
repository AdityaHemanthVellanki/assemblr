export type PolicyScope = "org" | "team" | "tool";

export type PolicyRuleType = 
  | "integration_allowlist" 
  | "capability_allowlist" 
  | "max_execution_frequency" 
  | "require_approval" 
  | "data_access_scope";

export type PolicyRule = {
  type: PolicyRuleType;
  params: Record<string, any>;
  action: "allow" | "deny" | "require_approval";
};

export type OrgPolicy = {
  id: string;
  org_id: string;
  name: string;
  scope: PolicyScope;
  target_id?: string; // Team ID or Tool ID if not org-wide
  rules: PolicyRule[];
  created_at: string;
  updated_at: string;
};

export type PolicyEvaluationResult = {
  allowed: boolean;
  reason?: string;
  blocking_rule?: PolicyRule;
};
