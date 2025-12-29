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
  {
    id: "postgres",
    name: "Postgres",
    category: "Database",
    logoUrl: "https://logo.clearbit.com/postgresql.org",
    description: "Query and analyze data from your Postgres database.",
    auth: {
      type: "database",
      fields: [
        { kind: "string", id: "host", label: "Host", required: true },
        { kind: "number", id: "port", label: "Port", required: true },
        { kind: "string", id: "database", label: "Database", required: true },
        { kind: "string", id: "username", label: "Username", required: true },
        { kind: "string", id: "password", label: "Password", required: true, secret: true },
        { kind: "boolean", id: "ssl", label: "Use SSL" },
      ],
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    logoUrl: "https://logo.clearbit.com/stripe.com",
    description: "Sync payments and subscription events from Stripe.",
    auth: {
      type: "api_key",
      fields: [
        { kind: "string", id: "apiKey", label: "API Key", required: true, secret: true },
        { kind: "string", id: "label", label: "Label (optional)", required: false },
      ],
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    logoUrl: "https://logo.clearbit.com/hubspot.com",
    description: "Pull contacts and CRM activity from HubSpot.",
    auth: {
      type: "api_key",
      fields: [
        {
          kind: "string",
          id: "accessToken",
          label: "Access Token",
          required: true,
          secret: true,
        },
        { kind: "string", id: "label", label: "Label (optional)", required: false },
      ],
    },
  },
  {
    id: "generic_api",
    name: "Generic REST/GraphQL",
    category: "Generic API",
    logoUrl: "https://logo.clearbit.com/postman.com",
    description: "Connect to any REST or GraphQL API via base URL and key.",
    auth: {
      type: "api_key",
      fields: [
        { kind: "string", id: "baseUrl", label: "Base URL", required: true },
        { kind: "string", id: "apiKey", label: "API Key (optional)", required: false, secret: true },
      ],
    },
  },
  {
    id: "csv",
    name: "CSV Upload",
    category: "Files",
    logoUrl: "https://logo.clearbit.com/google.com",
    description: "Upload CSV files and query them as structured tables.",
    auth: { type: "none" },
  },
] as const;

export function getIntegrationUIConfig(integrationId: string): IntegrationUIConfig {
  const found = INTEGRATIONS_UI.find((i) => i.id === integrationId);
  if (!found) throw new Error(`Integration UI config not found: ${integrationId}`);
  return found;
}

export function getConnector(integrationId: string): IntegrationConnector {
  const connector = CONNECTORS[integrationId];
  // For the purpose of this exercise, if a specific connector isn't implemented (e.g. 'segment'),
  // we could fallback to generic_api OR throw.
  // Given the "Escape Hatch" requirement, falling back to Generic might be dangerous without explicit user intent.
  // We will stick to strict resolution but acknowledge that 'generic_api' is the catch-all ID.
  if (!connector) {
    throw new Error(`Connector not found for integration: ${integrationId}`);
  }
  return connector;
}
