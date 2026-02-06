import { Composio } from "composio-core";
import { getServerEnv } from "@/lib/env/server";

let composioClient: Composio | null = null;

export const getComposioClient = () => {
    if (composioClient) return composioClient;

    const env = getServerEnv();
    const apiKey = env.COMPOSIO_API_KEY;

    if (!apiKey) {
        throw new Error("COMPOSIO_API_KEY is not defined in environment variables");
    }

    composioClient = new Composio({
        apiKey: apiKey,
    });

    return composioClient;
};
