import { getComposioClient } from "./client";

export const executeAction = async (
    entityId: string,
    actionId: string,
    input: Record<string, any>
) => {
    const client = getComposioClient();

    try {
        console.log(`[Composio] Executing action ${actionId} for entity ${entityId}. Params:`, JSON.stringify(input).slice(0, 500));
        const output = await client.getEntity(entityId).execute({
            actionName: actionId,
            params: input,
        });

        const count = Array.isArray(output) ? output.length : (output ? 1 : 0);
        console.log(`[Composio] Action ${actionId} completed. Result count: ${count}. Output type: ${typeof output}`);

        return output;
    } catch (error) {
        console.error(`Failed to execute action ${actionId}`, error);
        throw error;
    }
};
