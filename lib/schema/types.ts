export type SchemaField = {
  name: string;
  type: "string" | "number" | "boolean" | "date" | "object" | "array";
  nullable: boolean;
  description?: string;
};

export type DiscoveredSchema = {
  integrationId: string;
  resource: string; // e.g., "issues", "users", "pages"
  fields: SchemaField[];
  primaryKey?: string;
  lastDiscoveredAt: string;
};

export interface SchemaDiscoverer {
  discoverSchemas(credentials: Record<string, unknown>): Promise<DiscoveredSchema[]>;
}
