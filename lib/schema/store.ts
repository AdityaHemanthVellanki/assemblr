import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiscoveredSchema, SchemaDiscoverer } from "./types";
import { GitHubSchemaDiscoverer } from "@/lib/integrations/schema-discovery/github";
import { LinearSchemaDiscoverer } from "@/lib/integrations/schema-discovery/linear";
import { SlackSchemaDiscoverer } from "@/lib/integrations/schema-discovery/slack";
import { NotionSchemaDiscoverer } from "@/lib/integrations/schema-discovery/notion";
import { GoogleSchemaDiscoverer } from "@/lib/integrations/schema-discovery/google";

const DISCOVERERS: Record<string, SchemaDiscoverer> = {
  github: new GitHubSchemaDiscoverer(),
  linear: new LinearSchemaDiscoverer(),
  slack: new SlackSchemaDiscoverer(),
  notion: new NotionSchemaDiscoverer(),
  google: new GoogleSchemaDiscoverer(),
};

export async function fetchAndPersistSchemas(
  orgId: string,
  integrationId: string,
  credentials: Record<string, unknown>
): Promise<void> {
  const discoverer = DISCOVERERS[integrationId];
  if (!discoverer) {
    console.warn(`No schema discoverer for ${integrationId}`);
    return;
  }

  const schemas = await discoverer.discoverSchemas(credentials);
  const supabase = await createSupabaseServerClient();

  for (const schema of schemas) {
    // @ts-ignore: Supabase types not yet updated with new table
    const { error } = await (supabase
      .from("integration_schemas") as any)
      .upsert(
        {
          org_id: orgId,
          integration_id: integrationId,
          resource: schema.resource,
          schema_json: JSON.stringify(schema),
          last_discovered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,integration_id,resource" }
      );

    if (error) {
      console.error(`Failed to persist schema for ${integrationId}:${schema.resource}`, error);
    }
  }
}

export async function getDiscoveredSchemas(orgId: string): Promise<DiscoveredSchema[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase
    .from("integration_schemas") as any)
    .select("schema_json")
    .eq("org_id", orgId);

  if (error || !data) {
    console.error("Failed to load schemas", error);
    return [];
  }

  // @ts-ignore: Supabase types not yet updated with new table
  return data.map((row: any) => JSON.parse(row.schema_json as string) as DiscoveredSchema);
}
