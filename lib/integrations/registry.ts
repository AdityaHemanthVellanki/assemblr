import { IntegrationConnector } from "./types";
import { PostgresConnector } from "./connectors/postgres";
import { StripeConnector } from "./connectors/stripe";
import { HubspotConnector } from "./connectors/hubspot";
import { CsvConnector } from "./connectors/csv";

export const CONNECTORS: Record<string, IntegrationConnector> = {
  postgres: new PostgresConnector(),
  stripe: new StripeConnector(),
  hubspot: new HubspotConnector(),
  csv: new CsvConnector(),
};

export function getConnector(integrationId: string): IntegrationConnector {
  const connector = CONNECTORS[integrationId];
  if (!connector) {
    throw new Error(`Connector not found for integration: ${integrationId}`);
  }
  return connector;
}
