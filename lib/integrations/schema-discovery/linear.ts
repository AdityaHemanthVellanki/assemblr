import { SchemaDiscoverer, DiscoveredSchema } from "@/lib/schema/types";

export class LinearSchemaDiscoverer implements SchemaDiscoverer {
  async discoverSchemas(credentials: Record<string, unknown>): Promise<DiscoveredSchema[]> {
    const now = new Date().toISOString();
    
    // Linear schema is also fairly static for core types unless we introspect custom fields.
    // For Phase 1, we define the core fields we support in our Executor.
    return [
      {
        integrationId: "linear",
        resource: "issues",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "string", nullable: false, description: "Issue ID (UUID)" },
          { name: "identifier", type: "string", nullable: false, description: "Human readable ID (e.g. ENG-123)" },
          { name: "title", type: "string", nullable: false, description: "Issue title" },
          { name: "state", type: "object", nullable: false, description: "Workflow state" },
          { name: "priority", type: "number", nullable: false, description: "Priority (0-4)" },
          { name: "createdAt", type: "date", nullable: false, description: "Creation timestamp" },
          { name: "updatedAt", type: "date", nullable: false, description: "Last update timestamp" },
          { name: "assignee", type: "object", nullable: true, description: "Assigned user" },
        ],
      },
      {
        integrationId: "linear",
        resource: "teams",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "string", nullable: false, description: "Team ID" },
          { name: "name", type: "string", nullable: false, description: "Team name" },
          { name: "key", type: "string", nullable: false, description: "Team key (e.g. ENG)" },
        ],
      },
    ];
  }
}
