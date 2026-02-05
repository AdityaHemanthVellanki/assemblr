// import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DiscoveredSchema, SchemaField } from "./types";
import { getBroker } from "@/lib/broker";
import { SchemaDefinition } from "@/lib/broker/types";

// Helper to map Broker schema to Legacy/UI schema
function mapToDiscoveredSchema(orgId: string, integrationId: string, def: SchemaDefinition): DiscoveredSchema {
  return {
    integrationId: integrationId,
    resource: def.resourceType,
    fields: def.fields.map(f => ({
      name: f.name,
      type: f.type as any,
      nullable: !f.required,
      description: f.description
    })),
    lastDiscoveredAt: new Date().toISOString()
  };
}

export async function fetchAndPersistSchemas(
  orgId: string,
  integrationType: string,
  integrationId: string, // providerId (e.g. 'github')
  credentials: Record<string, unknown> // Ignored, Broker uses stored connection
): Promise<void> {
  try {
    console.log(`[SchemaStore] Triggering discovery via Broker for ${integrationId}`);
    const broker = getBroker();
    // Trigger discovery (which internally persists to broker_schemas)
    await broker.discoverSchemas(orgId, integrationId);
    console.log(`[SchemaStore] Discovery complete for ${integrationId}`);
  } catch (e) {
    console.error(`[SchemaStore] Failed to discover schemas for ${integrationId}`, e);
    // Don't throw, just log. Setup loop might continue.
  }
}

export async function getDiscoveredSchemas(orgId: string): Promise<DiscoveredSchema[]> {
  const supabase = createSupabaseAdminClient();

  // Read from NEW table `broker_schemas`
  const { data, error } = await supabase
    .from("broker_schemas" as any)
    .select("*")
    .eq("org_id", orgId);

  if (error || !data) {
    console.error("[SchemaStore] Failed to load broker schemas", error);
    return [];
  }

  // Map to UI DiscoveredSchema type
  return (data as any[]).map(row => {
    const def = row.schema_definition as SchemaDefinition;
    return mapToDiscoveredSchema(orgId, row.integration_id, def);
  });
}

