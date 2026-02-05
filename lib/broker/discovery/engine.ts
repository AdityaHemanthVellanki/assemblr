
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Connection, SchemaDefinition } from "../types";
import { DiscoveryStrategy } from "./types";
import { GitHubDiscoveryStrategy } from "./strategies/github";
import { LinearDiscoveryStrategy } from "./strategies/linear";
import { GoogleDiscoveryStrategy } from "./strategies/google";

const STRATEGIES: Record<string, DiscoveryStrategy> = {
    github: new GitHubDiscoveryStrategy(),
    linear: new LinearDiscoveryStrategy(),
    google: new GoogleDiscoveryStrategy(),
};

export class BrokerDiscoveryEngine {
    private supabase = createSupabaseAdminClient();

    async discoverAndPersist(orgId: string, integrationId: string): Promise<SchemaDefinition[]> {
        const strategy = STRATEGIES[integrationId];

        if (!strategy) {
            console.warn(`No discovery strategy for ${integrationId}. Skipping.`);
            return [];
        }

        console.log(`[Discovery] Starting discovery for ${integrationId} (Org: ${orgId})...`);

        try {
            // 1. Fetch Connection (with secrets)
            // Using admin client to access encrypted tokens
            const { data: connection, error } = await this.supabase
                .from("broker_connections")
                .select("*")
                .eq("org_id", orgId)
                .eq("integration_id", integrationId)
                .single();

            if (error || !connection) {
                console.error(`[Discovery] Connection not found for ${integrationId}`, error);
                // Return empty instead of throwing to avoid crashing the whole flow if one fails?
                // But this method is usually called specifically to discover.
                throw new Error("Connection not found");
            }

            // 2. Construct Context
            const context: any = {
                orgId,
                integrationId,
                accessToken: connection.access_token as string,
                refreshToken: connection.refresh_token as string | undefined,
                scopes: (connection.scopes as any) || []
            };

            // 3. Run Discovery
            const schemas = await strategy.discover(context);

            if (schemas.length === 0) {
                console.warn(`[Discovery] No schemas found for ${integrationId}.`);
                return [];
            }

            // 4. Persist to DB
            const { error: deleteError } = await this.supabase
                .from("broker_schemas" as any)
                .delete()
                .eq("org_id", orgId)
                .eq("integration_id", integrationId);

            if (deleteError) throw new Error(`Failed to clear old schemas: ${deleteError.message}`);

            const rows = schemas.map(s => ({
                org_id: orgId,
                integration_id: integrationId,
                resource_type: s.resourceType,
                schema_definition: s as any,
                version: 1,
                discovered_at: new Date().toISOString()
            }));

            const { error: insertError } = await this.supabase
                .from("broker_schemas" as any)
                .insert(rows);

            if (insertError) throw new Error(`Schema persistence failed: ${insertError.message}`);

            console.log(`[Discovery] Successfully discovered and persisted ${schemas.length} schemas for ${integrationId}.`);
            return schemas;

        } catch (e: any) {
            console.error(`[Discovery] Failed for ${integrationId}:`, e);
            throw e;
        }
    }
}
