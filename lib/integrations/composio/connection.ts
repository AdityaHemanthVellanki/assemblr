
import { getComposioClient } from "./client";
import { ComposioConnection } from "./types";
import { getIntegrationConfig, resolveAssemblrId, INTEGRATION_AUTH_CONFIG } from "./config";
import { getServerEnv } from "@/lib/env/server";

// Cache custom integration IDs to avoid re-creating on every connection attempt
const _customIntegrationCache = new Map<string, string>();

/**
 * Create or retrieve a custom Composio integration with Assemblr's own OAuth credentials.
 * Uses raw API because the SDK's getOrCreateIntegration has a bug.
 */
async function ensureCustomIntegration(appName: string, clientId: string, clientSecret: string): Promise<string> {
    const cached = _customIntegrationCache.get(appName);
    if (cached) return cached;

    const env = getServerEnv();
    const apiKey = env.COMPOSIO_API_KEY as string;

    // First, look up the app's UUID from Composio
    const appsRes = await fetch(`https://backend.composio.dev/api/v1/apps?name=${appName}`, {
        headers: { "x-api-key": apiKey },
    });
    const appsData = await appsRes.json();
    const app = Array.isArray(appsData)
        ? appsData.find((a: any) => a.key === appName)
        : appsData?.items?.find((a: any) => a.key === appName);

    if (!app?.appId) {
        throw new Error(`[Composio] Could not find appId for ${appName}`);
    }

    // Create integration with our own OAuth credentials
    const createRes = await fetch("https://backend.composio.dev/api/v1/integrations", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name: `assemblr_${appName}_${Date.now()}`,
            appId: app.appId,
            authScheme: "OAUTH2",
            useComposioAuth: false,
            authConfig: { client_id: clientId, client_secret: clientSecret },
        }),
    });

    const integration = await createRes.json();

    if (!integration.id) {
        throw new Error(`[Composio] Failed to create integration: ${JSON.stringify(integration)}`);
    }

    console.log(`[Composio] Custom integration created: ${integration.id} (redirect: ${integration.authConfig?.oauth_redirect_uri})`);
    _customIntegrationCache.set(appName, integration.id);
    return integration.id;
}

export const getComposioEntityId = (orgId: string) => {
    if (!orgId) throw new Error("Org ID is required for Entity ID");
    return `assemblr_org_${orgId}`;
};

export const createConnection = async (
    orgId: string,
    integrationId: string,
    resumeId?: string,
    options: {
        connectionParams?: Record<string, any>;
        scopes?: string[];
        label?: string;
    } = {}
): Promise<{ redirectUrl: string; connectionId: string }> => {
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
        scopes: options.scopes,
        label: options.label
    });

    try {
        // Construct payload ensuring we follow the v2/v3 spec for "initiate"
        const payload: any = {
            entityId,
            appName,
            redirectUri,
        };

        if (!config.useComposioAuth && config.customAuth) {
            // Use Assemblr's own OAuth credentials instead of Composio's managed app.
            // Composio's managed Slack app has the legacy "bot" scope which breaks modern OAuth v2.
            // We register our own integration with Composio using our client_id/secret.
            const clientId = process.env[config.customAuth.clientIdEnv];
            const clientSecret = process.env[config.customAuth.clientSecretEnv];

            if (!clientId || !clientSecret) {
                throw new Error(
                    `[Composio] Custom auth requires ${config.customAuth.clientIdEnv} and ${config.customAuth.clientSecretEnv} env vars`
                );
            }

            console.log(`[Composio] Using custom OAuth credentials for ${appName}`);

            const customIntegrationId = await ensureCustomIntegration(appName, clientId, clientSecret);

            // Use the custom integration ID — this ensures Composio uses OUR OAuth app
            payload.integrationId = customIntegrationId;
            delete payload.appName; // Don't pass appName when using integrationId
        } else if (config.useComposioAuth) {
            payload.authMode = "OAUTH2";
            payload.authConfig = {};

            // Critical Branding Overrides
            // @ts-ignore - SDK types might be outdated but API accepts these for UI branding
            payload.displayName = "Assemblr";
            // @ts-ignore
            payload.appLogo = `${baseUrl}/images/logo-full.png`;
        }


        if (options.label) {
            // Many Composio versions use 'label' in payload or connectionParams
            // We'll put it in both to be safe as per different SDK versions observed
            payload.label = options.label;
            payload.connectionParams = {
                ...(options.connectionParams || {}),
                label: options.label
            };
        } else if (options.connectionParams) {
            payload.connectionParams = options.connectionParams;
        }

        // Inject scopes if provided (merged from config and runtime)
        const finalScopes = [
            ...(config.scopes || []),
            ...(options.scopes || [])
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
            // Reverse-map Composio appName → Assemblr integration ID (e.g., "googlesheets" → "google")
            integrationId: connection.appName ? resolveAssemblrId(connection.appName) : connection.integrationId,
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
        return response.items.map((conn: any) => ({
            id: conn.id,
            // Reverse-map Composio appName → Assemblr integration ID (e.g., "googlesheets" → "google")
            integrationId: conn.appName ? resolveAssemblrId(conn.appName) : conn.integrationId,
            status: conn.status as any,
            connectedAt: conn.createdAt,
            appName: conn.appName,
            label: conn.label,
            metadata: conn.metadata
        }));
    } catch (e) {
        console.error("Failed to list connections", e);
        return [];
    }
}

// Known app name aliases — when an integration's appName changed (e.g., slack → slackbot),
// we still need to clean up connections under the old name.
const APP_NAME_ALIASES: Record<string, string[]> = {
    slackbot: ["slack"],
    googlesheets: ["google"],
};

export const removeConnection = async (orgId: string, integrationId: string, connectionId?: string): Promise<void> => {
    const client = getComposioClient();
    const entityId = getComposioEntityId(orgId);
    const config = getIntegrationConfig(integrationId);

    try {
        if (connectionId) {
            console.log(`[Composio] Explicitly removing connectionId: ${connectionId}`);
            await client.connectedAccounts.delete({ connectedAccountId: connectionId });
        } else {
            // Search current appName + any known aliases
            const appNames = [config.appName, ...(APP_NAME_ALIASES[config.appName] || [])];
            console.log(`[Composio] Removing all connections for apps: ${appNames.join(", ")} in org: ${orgId}`);

            for (const app of appNames) {
                // @ts-ignore - SDK types might be stricter but appNames accepts string
                const connections = await client.connectedAccounts.list({ entityId, appNames: app });
                for (const conn of connections.items) {
                    await client.connectedAccounts.delete({ connectedAccountId: conn.id });
                }
            }
        }
    } catch (e) {
        console.error("Failed to remove connection", e);
        throw e;
    }
}
