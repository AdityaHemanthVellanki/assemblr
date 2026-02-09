
import { getComposioClient } from "./client";
import { ComposioConnection } from "./types";
import { getIntegrationConfig } from "./config";

export const getComposioEntityId = (orgId: string) => {
    if (!orgId) throw new Error("Org ID is required for Entity ID");
    return `assemblr_org_${orgId}`;
};

export const createConnection = async (orgId: string, integrationId: string, resumeId?: string, connectionParams?: Record<string, any>, scopes?: string[]): Promise<{ redirectUrl: string; connectionId: string }> => {
    const client = getComposioClient();

    // Resolve configuration
    const config = getIntegrationConfig(integrationId);
    const entityId = getComposioEntityId(orgId);

    // Use configured appName (e.g., "jira", "github")
    const appName = config.appName;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) throw new Error("NEXT_PUBLIC_APP_URL is not defined");

    let redirectUri = `${baseUrl}/api/auth/callback/composio`;

    if (resumeId) {
        redirectUri += `?resumeId=${encodeURIComponent(resumeId)}`;
    }

    console.log("[Composio] Initiating connection:", {
        entityId,
        appName,
        useComposioAuth: config.useComposioAuth,
        redirectUri,
        originalIntegrationId: integrationId,
        scopes
    });

    try {
        // Construct payload ensuring we follow the v2/v3 spec for "initiate"
        const payload: any = {
            entityId,
            appName,
            redirectUri,
        };

        if (config.useComposioAuth) {
            payload.authMode = "OAUTH2";
            payload.authConfig = {};

            // Critical Branding Overrides
            // @ts-ignore - SDK types might be outdated but API accepts these for UI branding
            payload.displayName = "Assemblr";
            // @ts-ignore 
            payload.appLogo = `${baseUrl}/images/logo-full.png`;
        }

        if (connectionParams) {
            payload.connectionParams = connectionParams;
        }

        // Inject scopes if provided (merged from config and runtime)
        const finalScopes = [
            ...(config.scopes || []),
            ...(scopes || [])
        ];
        // Deduplicate
        const uniqueScopes = Array.from(new Set(finalScopes));

        if (uniqueScopes.length > 0) {
            // Try injecting in connectionParams as 'scopes' string or array
            payload.connectionParams = {
                ...(payload.connectionParams || {}),
                scopes: uniqueScopes.join(" ") // Many OAuth providers take space-separated string
            };
        }

        const connectionRequest = await client.connectedAccounts.initiate(payload);

        if (!connectionRequest.redirectUrl) {
            console.error("[Composio] No redirect URL in response:", connectionRequest);
            throw new Error("No redirect URL returned from Composio");
        }

        return {
            redirectUrl: connectionRequest.redirectUrl,
            connectionId: connectionRequest.connectedAccountId,
        };
    } catch (e: any) {
        console.error("[Composio] Connection initiation failed:", {
            error: e.message,
            description: e.description, // Composio specific
            data: e.data, // Composio specific
            entityId,
            appName
        });
        throw e;
    }
};

export const getConnectionStatus = async (connectionId: string): Promise<ComposioConnection | null> => {
    const client = getComposioClient();
    try {
        const connection = await client.connectedAccounts.get({ connectedAccountId: connectionId });
        return {
            id: connection.id,
            // Map appName to integrationId if available (preferred for Assemblr mapping)
            integrationId: connection.appName ? connection.appName.toLowerCase() : connection.integrationId,
            status: connection.status as any,
            connectedAt: connection.createdAt,
            appName: connection.appName,
        }
    } catch (e) {
        console.error("Failed to get connection status", e);
        return null;
    }
}

export const listConnections = async (orgId: string): Promise<ComposioConnection[]> => {
    const client = getComposioClient();
    const entityId = getComposioEntityId(orgId);
    try {
        const response = await client.connectedAccounts.list({ entityId });
        return response.items.map(c => ({
            id: c.id,
            // Map appName to integrationId if available (preferred for Assemblr mapping)
            integrationId: c.appName ? c.appName.toLowerCase() : c.integrationId,
            status: c.status as any,
            connectedAt: c.createdAt,
            appName: c.appName,
        }));
    } catch (e) {
        console.error("Failed to list connections", e);
        return [];
    }
}

export const removeConnection = async (orgId: string, integrationId: string): Promise<void> => {
    const client = getComposioClient();
    const entityId = getComposioEntityId(orgId);
    const config = getIntegrationConfig(integrationId);

    try {
        // Use appName for filtering
        // @ts-ignore - SDK types might be stricter but appNames accepts string
        const connections = await client.connectedAccounts.list({ entityId, appNames: config.appName });
        for (const conn of connections.items) {
            await client.connectedAccounts.delete({ connectedAccountId: conn.id });
        }
    } catch (e) {
        console.error("Failed to remove connection", e);
        throw e;
    }
}
