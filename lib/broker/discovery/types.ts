
import { SchemaDefinition } from "../types";

export type DiscoveryContext = {
    orgId: string;
    integrationId: string;
    accessToken: string; // Encrypted
    refreshToken?: string | null;
    scopes: string[];
};

export interface DiscoveryStrategy {
    discover(context: DiscoveryContext): Promise<SchemaDefinition[]>;
}

export interface DiscoveryEngine {
    discoverAndPersist(orgId: string, integrationId: string): Promise<SchemaDefinition[]>;
}
