import { SchemaDiscoverer, DiscoveredSchema } from "@/lib/schema/types";

export class NotionSchemaDiscoverer implements SchemaDiscoverer {
  async discoverSchemas(credentials: Record<string, unknown>): Promise<DiscoveredSchema[]> {
    const now = new Date().toISOString();
    
    // Notion is highly dynamic. Ideally we fetch real databases.
    // For Phase 1, we define the generic "Page" and "Database" schema.
    return [
      {
        integrationId: "notion",
        resource: "pages",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "string", nullable: false, description: "Page ID" },
          { name: "created_time", type: "date", nullable: false, description: "Creation time" },
          { name: "last_edited_time", type: "date", nullable: false, description: "Last edit time" },
          { name: "url", type: "string", nullable: false, description: "Notion URL" },
          { name: "properties", type: "object", nullable: false, description: "Page properties (dynamic)" },
        ],
      },
      {
        integrationId: "notion",
        resource: "databases",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "string", nullable: false, description: "Database ID" },
          { name: "title", type: "array", nullable: true, description: "Database title" },
          { name: "properties", type: "object", nullable: false, description: "Schema definition" },
        ],
      },
    ];
  }
}
