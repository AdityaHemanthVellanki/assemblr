// import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { DiscoveredSchema } from "./types";
import { discoverSchemas } from "./discovery";

export async function persistSchema(
  orgId: string,
  integrationType: string,
  schema: DiscoveredSchema
): Promise<void> {
  // CRITICAL FIX: Use admin client for schema persistence
  // The server client requires session auth which may not be available during OAuth callback
  const supabase = createSupabaseAdminClient();

  // SCHEMA CONTRACT FIX: Database uses `resource_type`, not `resource`
  // The schema.resource field maps to resource_type in the database
  const resourceType = schema.resource;

  // Validate required fields before attempting write
  if (!resourceType) {
    throw new Error(`Schema persistence failed: resource_type is required but was empty for ${integrationType}`);
  }
  if (!orgId) {
    throw new Error(`Schema persistence failed: org_id is required but was empty`);
  }

  const payload = {
    org_id: orgId,
    integration_id: integrationType,
    resource: resourceType,      // Required by DB (Legacy?)
    resource_type: resourceType, // Required by DB
    schema: JSON.stringify(schema),
    last_discovered_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  console.log(`[SchemaPersistence] Upserting schema for ${integrationType}:${resourceType}`, {
    orgId,
    integrationType,
    resource_type: resourceType,
    resource: resourceType,
    payloadKeys: Object.keys(payload),
  });

  const { error } = await (supabase
    .from("integration_schemas") as any)
    .upsert(
      payload,
      { onConflict: "org_id,integration_id,resource" } // Match DB constraint which uses 'resource'
    );

  if (error) {
    console.error(`[SchemaPersistence] FAILED to persist schema for ${integrationType}:${resourceType}`, {
      error,
      errorCode: error.code,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      payload,
    });
    // Re-throw so caller knows it failed
    throw new Error(`Schema persistence failed for ${integrationType}:${resourceType}: ${error.message}`);
  }

  console.log(`[SchemaPersistence] SUCCESS for ${integrationType}:${resourceType}`);
}


export async function fetchAndPersistSchemas(
  orgId: string,
  integrationType: string,
  integrationId: string,
  credentials: Record<string, unknown>
): Promise<void> {
  // 1. Discover
  const schemas = await discoverSchemas(orgId, integrationType, integrationId, credentials);

  if (schemas.length === 0) {
    console.warn(`[SchemaPersistence] No schemas discovered for ${integrationType}`);
    return;
  }

  // 2. Persist each schema
  const results: { resource: string; success: boolean; error?: string }[] = [];

  for (const schema of schemas) {
    try {
      await persistSchema(orgId, integrationType, schema);
      results.push({ resource: schema.resource, success: true });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      results.push({ resource: schema.resource, success: false, error: errorMsg });
    }
  }

  // 3. Check if any failed
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    console.error(`[SchemaPersistence] ${failures.length}/${schemas.length} schemas failed to persist`, {
      failures,
      integrationType,
      orgId,
    });
    // If ALL failed, throw error
    if (failures.length === schemas.length) {
      throw new Error(`All schema persistence failed for ${integrationType}`);
    }
  }

  console.log(`[SchemaPersistence] Completed for ${integrationType}: ${results.filter(r => r.success).length}/${schemas.length} succeeded`);
}

export async function getDiscoveredSchemas(orgId: string): Promise<DiscoveredSchema[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase
    .from("integration_schemas") as any)
    .select("schema")
    .eq("org_id", orgId);

  if (error || !data) {
    console.error("[SchemaPersistence] Failed to load schemas", error);
    return [];
  }

  return data.map((row: any) => JSON.parse(row.schema as string) as DiscoveredSchema);
}
