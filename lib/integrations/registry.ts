import { IntegrationConnector, IntegrationUIConfig } from "./types";
import { PostgresConnector } from "./connectors/postgres";
import { StripeConnector } from "./connectors/stripe";
import { HubspotConnector } from "./connectors/hubspot";
import { CsvConnector } from "./connectors/csv";
import { GenericApiConnector } from "./connectors/generic-api";

export const CONNECTORS: Record<string, IntegrationConnector> = {
  postgres: new PostgresConnector(),
  stripe: new StripeConnector(),
  hubspot: new HubspotConnector(),
  csv: new CsvConnector(),
  generic_api: new GenericApiConnector(),
};

export const INTEGRATIONS_UI: readonly IntegrationUIConfig[] = [
  // 1. Zero-Input
  {
    id: "csv",
    name: "CSV Upload",
    category: "Files",
    logoUrl: "https://logo.clearbit.com/google.com",
    description: "Upload CSV files and query them as structured tables.",
    connectionMode: "zero_input",
    auth: { type: "none" },
  },
  
  // 2. Guided Input (Databases)
  {
    id: "postgres",
    name: "Postgres",
    category: "Database",
    logoUrl: "https://logo.clearbit.com/postgresql.org",
    description: "Query and analyze data from your Postgres database.",
    connectionMode: "guided",
    auth: {
      type: "database",
      fields: [
        { kind: "string", id: "host", label: "Host", required: true },
        { kind: "number", id: "port", label: "Port", required: true },
        { kind: "string", id: "database", label: "Database", required: true },
        { kind: "string", id: "username", label: "Username", required: true },
        { kind: "string", id: "password", label: "Password", required: true, secret: true },
      ],
      advancedFields: [
        { kind: "boolean", id: "ssl", label: "Use SSL" },
      ],
    },
  },
  {
    id: "mysql",
    name: "MySQL",
    category: "Database",
    logoUrl: "https://logo.clearbit.com/mysql.com",
    description: "Connect to MySQL databases.",
    connectionMode: "guided",
    auth: {
      type: "database",
      fields: [
        { kind: "string", id: "host", label: "Host", required: true },
        { kind: "number", id: "port", label: "Port", required: true },
        { kind: "string", id: "database", label: "Database", required: true },
        { kind: "string", id: "username", label: "Username", required: true },
        { kind: "string", id: "password", label: "Password", required: true, secret: true },
      ],
    },
  },
  {
    id: "snowflake",
    name: "Snowflake",
    category: "Database",
    logoUrl: "https://logo.clearbit.com/snowflake.com",
    description: "Enterprise data warehouse.",
    connectionMode: "guided",
    auth: {
      type: "database",
      fields: [
        { kind: "string", id: "account", label: "Account Identifier", required: true },
        { kind: "string", id: "username", label: "Username", required: true },
        { kind: "string", id: "password", label: "Password", required: true, secret: true },
        { kind: "string", id: "warehouse", label: "Warehouse", required: true },
      ],
    },
  },

  // 3. One-Click OAuth
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    logoUrl: "https://logo.clearbit.com/stripe.com",
    description: "Sync payments and subscription events.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: ["read_write"],
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    logoUrl: "https://logo.clearbit.com/hubspot.com",
    description: "Pull contacts and CRM activity.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: ["crm.objects.contacts.read"],
    },
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM",
    logoUrl: "https://logo.clearbit.com/salesforce.com",
    description: "Enterprise CRM data sync.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: ["api", "refresh_token"],
    },
  },
  {
    id: "slack",
    name: "Slack",
    category: "Messaging",
    logoUrl: "https://logo.clearbit.com/slack.com",
    description: "Read messages and send notifications.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: ["channels:read", "chat:write"],
    },
  },
  {
    id: "github",
    name: "GitHub",
    category: "Engineering",
    logoUrl: "https://logo.clearbit.com/github.com",
    description: "Sync repositories, issues, and PRs.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: ["repo", "read:org"],
    },
  },
  {
    id: "google_analytics",
    name: "Google Analytics 4",
    category: "Analytics",
    logoUrl: "https://logo.clearbit.com/google.com",
    description: "Website traffic and events.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    },
  },
  {
    id: "notion",
    name: "Notion",
    category: "Files",
    logoUrl: "https://logo.clearbit.com/notion.so",
    description: "Access pages and databases.",
    connectionMode: "oauth",
    auth: {
      type: "oauth",
      scopes: [],
    },
  },

  // 4. Guided Input (API Keys / Advanced)
  {
    id: "openai",
    name: "OpenAI",
    category: "AI & ML",
    logoUrl: "https://logo.clearbit.com/openai.com",
    description: "Access GPT models and embeddings.",
    connectionMode: "guided",
    auth: {
      type: "api_key",
      fields: [
        { kind: "string", id: "apiKey", label: "API Key", required: true, secret: true },
      ],
      advancedFields: [
        { kind: "string", id: "orgId", label: "Organization ID" },
      ],
    },
  },
  {
    id: "aws",
    name: "AWS",
    category: "Cloud",
    logoUrl: "https://logo.clearbit.com/amazonaws.com",
    description: "Cloud infrastructure metrics and logs.",
    connectionMode: "advanced",
    auth: {
      type: "api_key",
      fields: [
        { kind: "string", id: "accessKeyId", label: "Access Key ID", required: true },
        { kind: "string", id: "secretAccessKey", label: "Secret Access Key", required: true, secret: true },
        { kind: "string", id: "region", label: "Region", required: true },
      ],
    },
  },
  {
    id: "generic_api",
    name: "Generic REST/GraphQL",
    category: "Generic API",
    logoUrl: "https://logo.clearbit.com/postman.com",
    description: "Connect to any REST or GraphQL API.",
    connectionMode: "advanced",
    auth: {
      type: "api_key",
      fields: [
        { kind: "string", id: "baseUrl", label: "Base URL", required: true },
      ],
      advancedFields: [
        { kind: "string", id: "apiKey", label: "API Key", secret: true },
        { kind: "string", id: "headers", label: "Custom Headers (JSON)" },
      ],
    },
  },
] as const;

export function getIntegrationUIConfig(integrationId: string): IntegrationUIConfig {
  const found = INTEGRATIONS_UI.find((i) => i.id === integrationId);
  if (!found) throw new Error(`Integration UI config not found: ${integrationId}`);
  return found;
}

export function getConnector(integrationId: string): IntegrationConnector {
  // 1. Try explicit connector
  const connector = CONNECTORS[integrationId];
  if (connector) return connector;

  // 2. Check if valid integration ID exists in UI config
  const config = INTEGRATIONS_UI.find((i) => i.id === integrationId);
  if (config) {
    throw new Error(`Connector not implemented for integration: ${integrationId}`);
  }

  throw new Error(`Connector not found for integration: ${integrationId}`);
}
