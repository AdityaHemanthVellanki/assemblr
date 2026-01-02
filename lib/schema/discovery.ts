import { DiscoveredSchema } from "./types";
import { githubDiscoverer } from "@/lib/integrations/discovery/github";
import { slackDiscoverer } from "@/lib/integrations/discovery/slack";
import { linearDiscoverer } from "@/lib/integrations/discovery/linear";

export interface SchemaDiscoverer {
  discoverSchemas(params: {
    orgId: string;
    integrationId: string;
    credentials: any;
  }): Promise<DiscoveredSchema[]>;
}

const DISCOVERERS: Record<string, SchemaDiscoverer> = {
  github: githubDiscoverer,
  slack: slackDiscoverer,
  linear: linearDiscoverer,
  // Add others as implemented
};

export async function discoverSchemas(
  orgId: string,
  integrationType: string, // 'github', 'slack', etc.
  integrationId: string, // Database ID
  credentials: any
): Promise<DiscoveredSchema[]> {
  const discoverer = DISCOVERERS[integrationType];
  
  if (!discoverer) {
    console.warn(`No schema discoverer found for ${integrationType}. Using default/empty.`);
    return [];
  }

  try {
    console.log(`Starting schema discovery for ${integrationType}...`);
    const schemas = await discoverer.discoverSchemas({
      orgId,
      integrationId,
      credentials
    });
    console.log(`Discovered ${schemas.length} schemas for ${integrationType}.`);
    return schemas;
  } catch (err) {
    console.error(`Schema discovery failed for ${integrationType}`, err);
    throw err;
  }
}
