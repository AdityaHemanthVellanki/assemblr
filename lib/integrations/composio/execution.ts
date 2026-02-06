import { getComposioClient } from "./client";

export const executeAction = async (
    entityId: string,
    actionId: string,
    input: Record<string, any>
) => {
    const client = getComposioClient();

    try {
        const output = await client.getEntity(entityId).execute({
            actionName: actionId,
            params: input,
        });

        return output;
    } catch (error) {
        console.error(`Failed to execute action ${actionId}`, error);
        throw error;
    }
};
