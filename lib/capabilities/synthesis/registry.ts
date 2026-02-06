import { ActionDetails } from "composio-core";
import { Capability } from "@/lib/capabilities/types";
import { Synthesizer } from "./synthesizer";
import { fetchIntegrationSchemas } from "@/lib/integrations/composio/discovery";

export class CapabilityRegistry {
    private synthesizer: Synthesizer;
    private cache: Map<string, Capability[]> = new Map();

    constructor() {
        this.synthesizer = new Synthesizer();
    }

    async getCapabilitiesForIntegration(integrationId: string, entityId: string): Promise<Capability[]> {
        if (this.cache.has(integrationId)) {
            return this.cache.get(integrationId)!;
        }

        try {
            const actions = await fetchIntegrationSchemas(entityId, integrationId);
            const capabilities = this.synthesizer.synthesize(actions, integrationId);

            this.cache.set(integrationId, capabilities);
            return capabilities;
        } catch (e) {
            console.error(`Failed to get capabilities for ${integrationId}`, e);
            return [];
        }
    }

    async getAllCapabilities(connections: { integrationId: string; entityId: string }[]): Promise<Capability[]> {
        const promises = connections.map(conn =>
            this.getCapabilitiesForIntegration(conn.integrationId, conn.entityId)
        );

        const results = await Promise.all(promises);
        return results.flat();
    }
}

export const capabilityRegistry = new CapabilityRegistry();
