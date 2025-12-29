export type Capability =
  | "tabular_data"
  | "time_series"
  | "payment_transactions"
  | "subscription_events"
  | "user_identity"
  | "crm_leads"
  | "event_tracking"
  | "file_ingest"
  | "api_fetch"
  | "messaging"
  | "workflow_action";

export type IntegrationDefinition = {
  id: string;
  name: string;
  capabilities: Capability[];
  dataShape: "tabular" | "events" | "files";
  requiresAuth: boolean;
  priority: number;
};

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    id: "postgres",
    name: "Postgres",
    capabilities: ["tabular_data", "user_identity", "time_series"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 10,
  },
  {
    id: "stripe",
    name: "Stripe",
    capabilities: ["payment_transactions", "subscription_events", "time_series"],
    dataShape: "events",
    requiresAuth: true,
    priority: 9,
  },
  {
    id: "hubspot",
    name: "HubSpot",
    capabilities: ["crm_leads", "user_identity"],
    dataShape: "tabular",
    requiresAuth: true,
    priority: 7,
  },
  {
    id: "csv",
    name: "CSV Upload",
    capabilities: ["file_ingest", "tabular_data"],
    dataShape: "files",
    requiresAuth: false,
    priority: 5,
  },
];

