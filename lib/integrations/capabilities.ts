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
  | "ai";

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
  // 1. Databases
  {
    id: "postgres",
    name: "Postgres",
    domain: "databases",
    capabilities: ["tabular_data", "user_identity", "time_series"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 10,
  },
  {
    id: "mysql",
    name: "MySQL",
    domain: "databases",
    capabilities: ["tabular_data", "user_identity", "time_series"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "snowflake",
    name: "Snowflake",
    domain: "databases",
    capabilities: ["tabular_data", "metrics_aggregation", "time_series"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "bigquery",
    name: "BigQuery",
    domain: "databases",
    capabilities: ["tabular_data", "metrics_aggregation", "time_series"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },

  // 2. Analytics
  {
    id: "segment",
    name: "Segment",
    domain: "analytics",
    capabilities: ["event_tracking", "user_behavior"],
    dataShape: "events",
    requiresAuth: true,
    priority: 8,
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    domain: "analytics",
    capabilities: ["funnel_analysis", "cohort_analysis", "user_behavior"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 8,
  },
  {
    id: "ga4",
    name: "Google Analytics 4",
    domain: "analytics",
    capabilities: ["user_behavior", "event_tracking"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 8,
  },

  // 3. Finance
  {
    id: "stripe",
    name: "Stripe",
    domain: "finance",
    capabilities: ["payment_transactions", "subscription_events", "revenue_metrics", "invoices"],
    dataShape: "events",
    requiresAuth: true,
    priority: 10,
  },
  {
    id: "quickbooks",
    name: "QuickBooks",
    domain: "finance",
    capabilities: ["revenue_metrics", "invoices"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 7,
  },

  // 4. CRM
  {
    id: "hubspot",
    name: "HubSpot",
    domain: "crm",
    capabilities: ["crm_leads", "deals_pipeline", "customer_identity"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "salesforce",
    name: "Salesforce",
    domain: "crm",
    capabilities: ["crm_leads", "deals_pipeline", "customer_identity"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "zendesk",
    name: "Zendesk",
    domain: "crm",
    capabilities: ["tickets", "customer_identity"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 8,
  },

  // 5. Marketing
  {
    id: "google_ads",
    name: "Google Ads",
    domain: "marketing",
    capabilities: ["campaign_metrics", "impressions", "conversions"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 8,
  },
  {
    id: "meta_ads",
    name: "Meta Ads",
    domain: "marketing",
    capabilities: ["campaign_metrics", "impressions", "conversions"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 8,
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    domain: "marketing",
    capabilities: ["campaign_metrics", "conversions"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 7,
  },

  // 6. Engineering
  {
    id: "github",
    name: "GitHub",
    domain: "engineering",
    capabilities: ["issues", "deployments", "velocity_metrics"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "jira",
    name: "Jira",
    domain: "engineering",
    capabilities: ["issues", "velocity_metrics"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "sentry",
    name: "Sentry",
    domain: "engineering",
    capabilities: ["incidents"],
    dataShape: "events",
    requiresAuth: true,
    priority: 8,
  },

  // 7. Infrastructure
  {
    id: "aws",
    name: "AWS",
    domain: "infrastructure",
    capabilities: ["infra_metrics", "cost_metrics", "logs"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "datadog",
    name: "Datadog",
    domain: "infrastructure",
    capabilities: ["infra_metrics", "logs", "health_checks"],
    dataShape: "metrics",
    requiresAuth: true,
    priority: 8,
  },

  // 8. Files
  {
    id: "csv",
    name: "CSV Upload",
    domain: "files",
    capabilities: ["file_ingest", "tabular_data"],
    dataShape: "files",
    requiresAuth: false,
    priority: 10,
  },
  {
    id: "google_sheets",
    name: "Google Sheets",
    domain: "files",
    capabilities: ["tabular_data"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "notion",
    name: "Notion",
    domain: "files",
    capabilities: ["document_store", "tabular_data"],
    dataShape: "files",
    requiresAuth: true,
    priority: 8,
  },

  // 9. HR
  {
    id: "okta",
    name: "Okta",
    domain: "hr",
    capabilities: ["employee_directory", "access_audit"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "workday",
    name: "Workday",
    domain: "hr",
    capabilities: ["employee_directory", "org_structure"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 8,
  },

  // 10. Messaging
  {
    id: "slack",
    name: "Slack",
    domain: "messaging",
    capabilities: ["messaging", "alerts"],
    dataShape: "messages",
    requiresAuth: true,
    priority: 10,
  },
  {
    id: "email",
    name: "Email (SMTP)",
    domain: "messaging",
    capabilities: ["messaging", "alerts"],
    dataShape: "messages",
    requiresAuth: true,
    priority: 9,
  },

  // 11. Generic
  {
    id: "generic_api",
    name: "Generic REST/GraphQL",
    domain: "generic_api",
    capabilities: ["api_fetch", "api_action"],
    dataShape: "json",
    requiresAuth: true,
    priority: 5,
  },

  // 12. AI
  {
    id: "openai",
    name: "OpenAI",
    domain: "ai",
    capabilities: ["classification", "summarization", "prediction"],
    dataShape: "json",
    requiresAuth: true,
    priority: 9,
  },
];
