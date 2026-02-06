import { getComposioClient } from "./client";
import { ComposioConnection } from "./types";

export const createConnection = async (entityId: string, integrationId: string, resumeId?: string): Promise<{ redirectUrl: string; connectionId: string }> => {
    const client = getComposioClient();

    let redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/composio`;
    if (resumeId) {
        redirectUri += `?resumeId=${encodeURIComponent(resumeId)}`;
    }

    // Initiate connection
    const connectionRequest = await client.connectedAccounts.initiate({
        entityId,
        integrationId,
        redirectUri,
    });

    if (!connectionRequest.redirectUrl) {
        throw new Error("No redirect URL returned from Composio");
    }

    return {
        redirectUrl: connectionRequest.redirectUrl,
        connectionId: connectionRequest.connectedAccountId,
    };
};

export const getConnectionStatus = async (connectionId: string): Promise<ComposioConnection | null> => {
    const client = getComposioClient();
    try {
        const connection = await client.connectedAccounts.get({ connectedAccountId: connectionId });
        return {
            id: connection.id,
            integrationId: connection.integrationId,
            status: connection.status as any,
            connectedAt: connection.createdAt,
            appName: connection.appName,
        }
    } catch (e) {
        console.error("Failed to get connection status", e);
        return null;
    }
}

export const listConnections = async (entityId: string): Promise<ComposioConnection[]> => {
    const client = getComposioClient();
    try {
        const response = await client.connectedAccounts.list({ entityId });
        return response.items.map(c => ({
            id: c.id,
            integrationId: c.integrationId,
            status: c.status as any,
            connectedAt: c.createdAt,
            appName: c.appName,
        }));
    } catch (e) {
        console.error("Failed to list connections", e);
        return [];
    }
}

export const removeConnection = async (entityId: string, integrationId: string): Promise<void> => {
    const client = getComposioClient();
    try {
        // We first need to find the connected account ID for this integration and entity
        const connections = await client.connectedAccounts.list({ entityId, integrationId });
        for (const conn of connections.items) {
            await client.connectedAccounts.delete({ connectedAccountId: conn.id });
        }
    } catch (e) {
        console.error("Failed to remove connection", e);
        throw e;
    }
}
