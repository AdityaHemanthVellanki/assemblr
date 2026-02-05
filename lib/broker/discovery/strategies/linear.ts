
import { LinearClient } from "@linear/sdk";
import { SchemaDefinition } from "../../types";
import { DiscoveryStrategy, DiscoveryContext } from "../types";
import { decrypt } from "../../security";

export class LinearDiscoveryStrategy implements DiscoveryStrategy {
    async discover(context: DiscoveryContext): Promise<SchemaDefinition[]> {
        const decryptedToken = decrypt(context.accessToken);

        const client = new LinearClient({
            accessToken: decryptedToken
        });

        // 1. Verify access
        const viewer = await client.viewer;
        if (!viewer?.id) throw new Error("Failed to verify Linear access");

        // 2. Linear Schemas
        const issueSchema: SchemaDefinition = {
            resourceType: "issue",
            fields: [
                { name: "id", type: "string", required: true },
                { name: "identifier", type: "string", required: true }, // LIN-123
                { name: "title", type: "string", required: true },
                { name: "description", type: "string" },
                { name: "priority", type: "number" },
                { name: "state", type: "object" },
                { name: "assignee", type: "object" },
                { name: "team", type: "object" }
            ]
        };

        const projectSchema: SchemaDefinition = {
            resourceType: "project",
            fields: [
                { name: "id", type: "string", required: true },
                { name: "name", type: "string", required: true },
                { name: "description", type: "string" },
                { name: "state", type: "string" },
                { name: "progress", type: "number" }
            ]
        };

        return [issueSchema, projectSchema];
    }
}
