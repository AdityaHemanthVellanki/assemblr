import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DiscoveredSchema } from "./types";
import { discoverSchemas } from "./discovery";

export async function fetchAndPersistSchemas(
  orgId: string,
  integrationType: string,
  integrationId: string, // Database ID of the integration row
  credentials: Record<string, unknown>
): Promise<void> {
  // 1. Discover
  const schemas = await discoverSchemas(orgId, integrationType, integrationId, credentials);
  const supabase = await createSupabaseServerClient();

  // 2. Persist
  for (const schema of schemas) {
    // 2a. Insert into Version History (Log)
    // @ts-ignore
    await (supabase.from("integration_schema_versions") as any)
      .insert({
        org_id: orgId,
        integration_id: integrationType, // Using type as ID for now, or real UUID if available
        resource: schema.resource,
        schema: JSON.stringify(schema),
        is_active: true
      });

    // 2b. Update Active View (Current State)
    // @ts-ignore: Supabase types not yet updated with new table
    const { error } = await (supabase
      .from("integration_schemas") as any)
      .upsert(
        {
          org_id: orgId,
          integration_id: integrationType,
          resource: schema.resource,
          schema: JSON.stringify(schema),
          last_discovered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,integration_id,resource" }
      );

    if (error) {
      console.error(`Failed to persist schema for ${integrationType}:${schema.resource}`, error);
    }
  }
}

export async function getDiscoveredSchemas(orgId: string): Promise<DiscoveredSchema[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await (supabase
    .from("integration_schemas") as any)
    .select("schema")
    .eq("org_id", orgId);

  if (error || !data) {
    console.error("Failed to load schemas", error);
    return [];
  }

  // @ts-ignore: Supabase types not yet updated with new table
  return data.map((row: any) => JSON.parse(row.schema as string) as DiscoveredSchema);
}
