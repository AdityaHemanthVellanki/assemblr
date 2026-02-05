
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import crypto from 'crypto';
import {
    IntegrationBroker,
    IntegrationDefinition,
    ConnectionResult,
    Connection,
    ConnectionHealth,
    SchemaDefinition,
    Capability,
    ScopeValidation,
    ExecutionContext,
    ActionResult
} from "./types";
import { PROVIDER_REGISTRY } from "./registry/definitions";
import { OAuthLogic } from "./oauth";
import { encrypt, decrypt } from "./security";
import { BrokerDiscoveryEngine } from "./discovery/engine";
import { CapabilitySynthesizer } from "./capabilities/synthesizer";
import { EXECUTORS } from "@/lib/integrations/map";

export class AssemblrBroker implements IntegrationBroker {
    private supabase = createSupabaseAdminClient();
    private discoveryEngine = new BrokerDiscoveryEngine();

    async listAvailableIntegrations(): Promise<IntegrationDefinition[]> {
        return Object.values(PROVIDER_REGISTRY).map(config => ({
            id: config.id,
            name: config.name,
            description: `Connect to ${config.name}`,
            category: "Productivity",
            authMode: "oauth",
        }));
    }

    async initiateConnection(orgId: string, userId: string, integrationId: string, returnPath: string, resumeId: string): Promise<{ authUrl: string; state: string; codeVerifier?: string }> {
        // 1. Verify registry
        if (!PROVIDER_REGISTRY[integrationId]) throw new Error(`Integration ${integrationId} not found`);

        // 2. Generate Secure State
        // Embed resumeId and a nonce to prevent CSRF and replay.
        // Format: base64(json({ resumeId, nonce }))
        const nonce = crypto.randomUUID();
        const statePayload = JSON.stringify({ resumeId, nonce });
        const state = Buffer.from(statePayload).toString("base64");

        // 3. Generate URL
        const { url, codeVerifier } = OAuthLogic.generateAuthUrl(integrationId, state);

        return { authUrl: url, state, codeVerifier };
    }

    async resumeConnection(resumeId: string, integrationId: string, code: string, codeVerifier?: string): Promise<ConnectionResult> {
        // 1. Get Context (ensure valid request)
        const { data: context, error } = await this.supabase
            .from("oauth_resume_contexts")
            .select("*")
            .eq("id", resumeId)
            .single();

        if (error || !context) throw new Error("Resume context not found");

        const userId = context.user_id;
        const orgId = context.org_id;

        // 2. Exchange Code
        try {
            const tokens = await OAuthLogic.exchangeCode(integrationId, code, codeVerifier);

            // 3. Encrypt Tokens
            const encryptedAccess = encrypt(tokens.accessToken);
            const encryptedRefresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;

            // 4. Persistence
            // Upsert connection
            const { data: upserted, error: upsertError } = await this.supabase
                .from("broker_connections" as any)
                .upsert({
                    org_id: orgId,
                    user_id: userId,
                    integration_id: integrationId,
                    access_token: encryptedAccess,
                    refresh_token: encryptedRefresh,
                    expires_at: tokens.expiresAt?.toISOString(),
                    token_type: tokens.tokenType,
                    status: "active",
                    scopes: tokens.scope || {},
                    metadata: tokens.raw,
                    updated_at: new Date().toISOString()
                }, { onConflict: "org_id, integration_id, user_id" })
                .select()
                .single();

            if (upsertError) {
                console.error("Broker upsert error:", upsertError);
                return { success: false, error: upsertError.message };
            }

            return {
                success: true,
                connection: {
                    id: (upserted as any).id,
                    integrationId,
                    orgId,
                    userId,
                    status: "active",
                    createdAt: (upserted as any).created_at,
                    updatedAt: (upserted as any).updated_at,
                    metadata: (upserted as any).metadata
                }
            };

        } catch (e: any) {
            console.error("Resume connection failed:", e);
            return { success: false, error: e.message };
        }
    }

    async listConnectedIntegrations(orgId: string): Promise<Connection[]> {
        const { data, error } = await this.supabase
            .from("broker_connections" as any)
            .select("*")
            .eq("org_id", orgId)
            .eq("status", "active");

        if (error) throw new Error(error.message);

        return (data as any[]).map(r => ({
            id: r.id,
            integrationId: r.integration_id,
            orgId: r.org_id,
            userId: r.user_id,
            status: r.status,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            metadata: r.metadata
        }));
    }

    async revokeConnection(orgId: string, integrationId: string): Promise<void> {
        // Todo: Call provider revoke endpoint if available
        await this.supabase
            .from("broker_connections" as any)
            .delete()
            .eq("org_id", orgId)
            .eq("integration_id", integrationId);
    }

    async testConnection(orgId: string, integrationId: string): Promise<ConnectionHealth> {
        // Check validation
        return { healthy: true, lastCheckedAt: new Date().toISOString() };
    }

    async discoverSchemas(orgId: string, integrationId: string): Promise<SchemaDefinition[]> {
        return this.discoveryEngine.discoverAndPersist(orgId, integrationId);
    }

    async listCapabilities(integrationId: string): Promise<Capability[]> {
        const standardSchemas = this.getStandardSchemas(integrationId);
        return CapabilitySynthesizer.synthesize(integrationId, standardSchemas);
    }

    private getStandardSchemas(integrationId: string): SchemaDefinition[] {
        if (integrationId === 'github') return [{ resourceType: 'repository', fields: [] }, { resourceType: 'issue', fields: [] }, { resourceType: 'pull_request', fields: [] }];
        if (integrationId === 'linear') return [{ resourceType: 'issue', fields: [] }, { resourceType: 'project', fields: [] }];
        if (integrationId === 'google') return [{ resourceType: 'gmail_message', fields: [] }, { resourceType: 'drive_file', fields: [] }];
        return [];
    }

    async validateScopes(orgId: string, actionId: string): Promise<ScopeValidation> {
        return { valid: true, missingScopes: [] };
    }

    async executeAction(actionId: string, params: Record<string, unknown>, context: ExecutionContext): Promise<ActionResult> {
        const parts = actionId.split('_');
        const integrationId = parts[0];
        const resource = parts[1];

        const executor = EXECUTORS[integrationId];
        if (!executor) throw new Error(`No executor for ${integrationId}`);

        // 1. Get Token (Refresh if needed)
        const accessToken = await this.getValidToken(context.orgId, integrationId);

        // 2. Construct Plan
        const plan = {
            viewId: "action_" + Date.now(),
            integrationId,
            capabilityId: actionId,
            resource: resource === "repository" ? "repos" : resource,
            params,
        };

        // 3. Execute
        const result = await executor.execute({
            plan,
            credentials: { access_token: accessToken }
        });

        if (result.status === "error") {
            return { success: false, error: result.error, data: null };
        }

        return { success: true, data: result.rows };
    }

    // New Helper: Token Management
    private async getValidToken(orgId: string, integrationId: string): Promise<string> {
        const { data: rawConnection, error } = await this.supabase
            .from("broker_connections" as any)
            .select("*")
            .eq("org_id", orgId)
            .eq("integration_id", integrationId)
            .single();

        if (error || !rawConnection) throw new Error(`Connection not found for ${integrationId}`);

        const connection = rawConnection as any;

        const expiresAt = connection.expires_at ? new Date(connection.expires_at).getTime() : 0;
        const now = Date.now();
        const isExpired = expiresAt > 0 && now > (expiresAt - 300000); // 5 min buffer

        let accessToken = connection.access_token;

        if (isExpired && connection.refresh_token) {
            console.log(`[Broker] Refreshing token for ${integrationId}`);
            try {
                const refreshed = await OAuthLogic.refreshTokens(integrationId, decrypt(connection.refresh_token));

                const encryptedAccess = encrypt(refreshed.accessToken);
                const encryptedRefresh = refreshed.refreshToken ? encrypt(refreshed.refreshToken) : connection.refresh_token;

                await this.supabase.from("broker_connections" as any).update({
                    access_token: encryptedAccess,
                    refresh_token: encryptedRefresh,
                    expires_at: refreshed.expiresAt?.toISOString(),
                    updated_at: new Date().toISOString()
                }).eq("id", connection.id);

                accessToken = encryptedAccess;
            } catch (refErr) {
                console.error("Token refresh failed", refErr);
                throw new Error("Token expired and refresh failed.");
            }
        } else if (isExpired && !connection.refresh_token) {
            throw new Error("Token expired and no refresh token available.");
        }

        return decrypt(accessToken);
    }
}
