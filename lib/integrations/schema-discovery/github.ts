import { SchemaDiscoverer, DiscoveredSchema } from "@/lib/schema/types";

export class GitHubSchemaDiscoverer implements SchemaDiscoverer {
  async discoverSchemas(credentials: Record<string, unknown>): Promise<DiscoveredSchema[]> {
    // In Phase 1, we can return known static schemas for standard resources.
    // In a real implementation, this could fetch custom fields if applicable.
    // GitHub schemas are generally static for REST resources.
    const now = new Date().toISOString();
    
    return [
      {
        integrationId: "github",
        resource: "issues",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "number", nullable: false, description: "Issue ID" },
          { name: "number", type: "number", nullable: false, description: "Issue number" },
          { name: "title", type: "string", nullable: false, description: "Issue title" },
          { name: "state", type: "string", nullable: false, description: "open or closed" },
          { name: "created_at", type: "date", nullable: false, description: "Creation timestamp" },
          { name: "updated_at", type: "date", nullable: false, description: "Last update timestamp" },
          { name: "user", type: "object", nullable: false, description: "User who created the issue" },
          { name: "assignee", type: "object", nullable: true, description: "Assigned user" },
        ],
      },
      {
        integrationId: "github",
        resource: "repos",
        lastDiscoveredAt: now,
        primaryKey: "id",
        fields: [
          { name: "id", type: "number", nullable: false, description: "Repo ID" },
          { name: "name", type: "string", nullable: false, description: "Repository name" },
          { name: "full_name", type: "string", nullable: false, description: "owner/repo" },
          { name: "private", type: "boolean", nullable: false, description: "Is private repo" },
          { name: "description", type: "string", nullable: true, description: "Repo description" },
          { name: "stargazers_count", type: "number", nullable: false, description: "Star count" },
          { name: "created_at", type: "date", nullable: false, description: "Creation timestamp" },
        ],
      },
    ];
  }
}
