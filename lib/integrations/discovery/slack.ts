
import { SchemaDiscoverer, DiscoveredSchema } from "@/lib/schema/types";

export const slackDiscoverer: SchemaDiscoverer = {
    discoverSchemas: async (credentials: Record<string, unknown>) => {
        return [] as DiscoveredSchema[];
    }
};
