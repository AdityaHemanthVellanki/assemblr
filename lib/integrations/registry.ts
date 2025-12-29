import { IntegrationConnector } from "./types";
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
