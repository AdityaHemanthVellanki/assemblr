export type IntegrationDomain =
  | "databases"
  | "analytics"
  | "finance"
  | "crm"
  | "marketing"
  | "engineering"
  | "infrastructure"
  | "files"
  | "hr"
  | "messaging"
  | "generic_api"
  | "ai"
  | "productivity";

export type Capability =
  // 1. Databases
  | "tabular_data"
  | "time_series"
  | "user_identity"
  | "metrics_aggregation"
  // 2. Analytics
  | "event_tracking"
  | "funnel_analysis"
  | "cohort_analysis"
  | "user_behavior"
  // 3. Finance
  | "payment_transactions"
  | "subscription_events"
  | "revenue_metrics"
  | "refunds"
  | "invoices"
  // 4. CRM
  | "crm_leads"
  | "deals_pipeline"
  | "tickets"
  | "customer_identity"
  // 5. Marketing
  | "campaign_metrics"
  | "impressions"
  | "conversions"
  | "attribution"
  // 6. Engineering
  | "issues"
  | "deployments"
  | "incidents"
  | "velocity_metrics"
  // 7. Infrastructure
  | "infra_metrics"
  | "cost_metrics"
  | "logs"
  | "health_checks"
  // 8. Files
  | "file_ingest"
  | "document_store"
  // 9. HR
  | "employee_directory"
  | "access_audit"
  | "org_structure"
  // 10. Messaging
  | "messaging"
  | "alerts"
  | "approvals"
  // 11. Generic
  | "api_fetch"
  | "api_action"
  // 12. AI
  | "classification"
  | "summarization"
  | "prediction"
  | "semantic_search"
  // Legacy/Back-compat
  | "workflow_action";

export type CapabilityDefinition = {
  id: Capability;
  integration: string;
  resource: string;
  mode: "read" | "write";
  paramsSchema: Record<string, any>;
};

export const CAPABILITY_DEFINITIONS: Record<Capability, CapabilityDefinition> = {
  // GitHub
  "issues": {
    id: "issues",
    integration: "github",
    resource: "issues",
    mode: "read",
    paramsSchema: { repo: "string" }
  },
  "deployments": {
    id: "deployments",
    integration: "github",
    resource: "deployments",
    mode: "read",
    paramsSchema: { repo: "string" }
  },
  "velocity_metrics": {
    id: "velocity_metrics",
    integration: "github",
    resource: "commits",
    mode: "read",
    paramsSchema: { repo: "string" }
  },
  // Slack
  "messaging": {
    id: "messaging",
    integration: "slack",
    resource: "messages",
    mode: "read",
    paramsSchema: { channel: "string" }
  },
  "alerts": {
    id: "alerts",
    integration: "slack",
    resource: "alerts",
    mode: "write",
    paramsSchema: { channel: "string", text: "string" }
  },
  // Linear
  // Notion
  "document_store": {
    id: "document_store",
    integration: "notion",
    resource: "pages",
    mode: "read",
    paramsSchema: {}
  },
  "tabular_data": {
    id: "tabular_data",
    integration: "notion", // or generic
    resource: "databases",
    mode: "read",
    paramsSchema: { database_id: "string" }
  },
  // Placeholders for others to pass type check
  "time_series": { id: "time_series", integration: "generic", resource: "metrics", mode: "read", paramsSchema: {} },
  "user_identity": { id: "user_identity", integration: "generic", resource: "users", mode: "read", paramsSchema: {} },
  "metrics_aggregation": { id: "metrics_aggregation", integration: "generic", resource: "metrics", mode: "read", paramsSchema: {} },
  "event_tracking": { id: "event_tracking", integration: "generic", resource: "events", mode: "read", paramsSchema: {} },
  "funnel_analysis": { id: "funnel_analysis", integration: "generic", resource: "events", mode: "read", paramsSchema: {} },
  "cohort_analysis": { id: "cohort_analysis", integration: "generic", resource: "events", mode: "read", paramsSchema: {} },
  "user_behavior": { id: "user_behavior", integration: "generic", resource: "events", mode: "read", paramsSchema: {} },
  "payment_transactions": { id: "payment_transactions", integration: "stripe", resource: "charges", mode: "read", paramsSchema: {} },
  "subscription_events": { id: "subscription_events", integration: "stripe", resource: "subscriptions", mode: "read", paramsSchema: {} },
  "revenue_metrics": { id: "revenue_metrics", integration: "stripe", resource: "balance", mode: "read", paramsSchema: {} },
  "refunds": { id: "refunds", integration: "stripe", resource: "refunds", mode: "read", paramsSchema: {} },
  "invoices": { id: "invoices", integration: "stripe", resource: "invoices", mode: "read", paramsSchema: {} },
  "crm_leads": { id: "crm_leads", integration: "salesforce", resource: "leads", mode: "read", paramsSchema: {} },
  "deals_pipeline": { id: "deals_pipeline", integration: "salesforce", resource: "opportunities", mode: "read", paramsSchema: {} },
  "tickets": { id: "tickets", integration: "zendesk", resource: "tickets", mode: "read", paramsSchema: {} },
  "customer_identity": { id: "customer_identity", integration: "salesforce", resource: "contacts", mode: "read", paramsSchema: {} },
  "campaign_metrics": { id: "campaign_metrics", integration: "google_ads", resource: "campaigns", mode: "read", paramsSchema: {} },
  "impressions": { id: "impressions", integration: "google_ads", resource: "metrics", mode: "read", paramsSchema: {} },
  "conversions": { id: "conversions", integration: "google_ads", resource: "metrics", mode: "read", paramsSchema: {} },
  "attribution": { id: "attribution", integration: "generic", resource: "events", mode: "read", paramsSchema: {} },
  "incidents": { id: "incidents", integration: "pagerduty", resource: "incidents", mode: "read", paramsSchema: {} },
  "infra_metrics": { id: "infra_metrics", integration: "datadog", resource: "metrics", mode: "read", paramsSchema: {} },
  "cost_metrics": { id: "cost_metrics", integration: "aws", resource: "costs", mode: "read", paramsSchema: {} },
  "logs": { id: "logs", integration: "datadog", resource: "logs", mode: "read", paramsSchema: {} },
  "health_checks": { id: "health_checks", integration: "generic", resource: "status", mode: "read", paramsSchema: {} },
  "file_ingest": { id: "file_ingest", integration: "generic", resource: "files", mode: "write", paramsSchema: {} },
  "employee_directory": { id: "employee_directory", integration: "workday", resource: "employees", mode: "read", paramsSchema: {} },
  "access_audit": { id: "access_audit", integration: "okta", resource: "logs", mode: "read", paramsSchema: {} },
  "org_structure": { id: "org_structure", integration: "workday", resource: "org", mode: "read", paramsSchema: {} },
  "approvals": { id: "approvals", integration: "generic", resource: "approvals", mode: "write", paramsSchema: {} },
  "api_fetch": { id: "api_fetch", integration: "generic", resource: "api", mode: "read", paramsSchema: {} },
  "api_action": { id: "api_action", integration: "generic", resource: "api", mode: "write", paramsSchema: {} },
  "classification": { id: "classification", integration: "openai", resource: "text", mode: "read", paramsSchema: {} },
  "summarization": { id: "summarization", integration: "openai", resource: "text", mode: "read", paramsSchema: {} },
  "prediction": { id: "prediction", integration: "openai", resource: "data", mode: "read", paramsSchema: {} },
  "semantic_search": { id: "semantic_search", integration: "openai", resource: "embeddings", mode: "read", paramsSchema: {} },
  "workflow_action": { id: "workflow_action", integration: "generic", resource: "workflow", mode: "write", paramsSchema: {} },
};

export type IntegrationDefinition = {
  id: string;
  name: string;
  domain: IntegrationDomain;
  capabilities: Capability[];
  dataShape: "tabular" | "events" | "files" | "messages" | "metrics" | "json";
  requiresAuth: boolean;
  priority: number;
};

export const INTEGRATIONS: IntegrationDefinition[] = [
  // 1. GitHub
  {
    id: "github",
    name: "GitHub",
    domain: "engineering",
    capabilities: ["issues", "deployments", "velocity_metrics"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  // 3. Slack
  {
    id: "slack",
    name: "Slack",
    domain: "messaging",
    capabilities: ["messaging", "alerts"],
    dataShape: "messages",
    requiresAuth: true,
    priority: 10,
  },
  // 4. Notion
  {
    id: "notion",
    name: "Notion",
    domain: "files",
    capabilities: ["document_store", "tabular_data"],
    dataShape: "files",
    requiresAuth: true,
    priority: 8,
  },
  // 5. Linear
  {
    id: "linear",
    name: "Linear",
    domain: "engineering",
    capabilities: ["issues", "velocity_metrics"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  // 6. Google
  {
    id: "google",
    name: "Google",
    domain: "productivity",
    capabilities: ["tabular_data", "document_store", "messaging", "alerts"],
    dataShape: "files",
    requiresAuth: true,
    priority: 9,
  },
];
