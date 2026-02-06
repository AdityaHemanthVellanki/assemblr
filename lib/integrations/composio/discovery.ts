import { getComposioClient } from "./client";
import { ActionDetails } from "composio-core";

export const fetchIntegrationSchemas = async (entityId: string, integrationId: string): Promise<ActionDetails[]> => {
    const client = getComposioClient();

    try {
        // Fetch actions filtered by the app (integrationId usually maps to appName or appId)
        // integrationId might need to be resolved to 'apps' param
        const response = await client.actions.list({
            apps: integrationId,
        });

        return response.items;
    } catch (error) {
        console.error(`Failed to fetch schemas for ${integrationId}`, error);
        throw error;
    }
}
