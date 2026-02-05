
import { Capability, SchemaDefinition } from "../types";

export class CapabilitySynthesizer {
    static synthesize(integrationId: string, schemas: SchemaDefinition[]): Capability[] {
        const capabilities: Capability[] = [];

        for (const schema of schemas) {
            const resource = schema.resourceType;

            // 1. List Capability (Standard for all resources)
            capabilities.push({
                id: `${integrationId}_${resource}_list`,
                integrationId,
                resource: resource, // Helper for Executor
                type: "list",
                displayName: `List ${resource}s`,
                description: `List standard ${resource} objects`,
                inputSchema: {
                    type: "object",
                    properties: {
                        limit: { type: "number" },
                        sort: { type: "string" },
                        direction: { type: "string" }
                        // Filters would be dynamic based on schema fields
                    }
                },
                outputSchema: {
                    type: "array",
                    items: { type: "object" } // Full object
                }
            });

            // 2. Resource Specific Capabilities
            if (resource === "issue") {
                capabilities.push({
                    id: `${integrationId}_${resource}_create`,
                    integrationId,
                    resource: resource,
                    type: "action",
                    displayName: `Create ${resource}`,
                    description: `Create a new ${resource}`,
                    inputSchema: {
                        type: "object",
                        properties: {
                            title: { type: "string", required: true },
                            description: { type: "string" },
                            // Add mapped fields
                        }
                    },
                    outputSchema: { type: "object" }
                });
            }

            if (resource === "gmail_message") {
                capabilities.push({
                    id: `${integrationId}_${resource}_send`,
                    integrationId,
                    resource: resource,
                    type: "action",
                    displayName: `Send Email`,
                    description: `Send a generic email`,
                    inputSchema: {
                        type: "object",
                        required: ["to", "subject", "body"],
                        properties: {
                            to: { type: "string" },
                            subject: { type: "string" },
                            body: { type: "string" }
                        }
                    },
                    outputSchema: { type: "object" }
                });
            }
        }

        return capabilities;
    }
}
