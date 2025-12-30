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
