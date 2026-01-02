import { SchemaDiscoverer, DiscoveredSchema } from "@/lib/schema/types";

export class GoogleSchemaDiscoverer implements SchemaDiscoverer {
  async discoverSchemas(credentials: Record<string, unknown>): Promise<DiscoveredSchema[]> {
    const now = new Date().toISOString();
    
    return [
      {
        integrationId: "google",
        resource: "drive",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "string", nullable: false, description: "File ID" },
          { name: "name", type: "string", nullable: false, description: "File name" },
          { name: "mimeType", type: "string", nullable: false, description: "MIME type" },
          { name: "webViewLink", type: "string", nullable: true, description: "View link" },
          { name: "createdTime", type: "date", nullable: true, description: "Creation time" },
        ],
      },
      {
        integrationId: "google",
        resource: "gmail",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "string", nullable: false, description: "Message ID" },
          { name: "threadId", type: "string", nullable: false, description: "Thread ID" },
          { name: "snippet", type: "string", nullable: true, description: "Message snippet" },
        ],
      },
    ];
  }
}
