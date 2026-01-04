import { SchemaDiscoverer } from "@/lib/schema/discovery";
import { DiscoveredSchema } from "@/lib/schema/types";

export const githubDiscoverer: SchemaDiscoverer = {
  async discoverSchemas({ credentials }) {
    // In a real implementation, we would call GitHub API
    // GET /user/repos, GET /repos/{owner}/{repo}/issues (to inspect structure)
    // For Phase 14, we return the canonical schemas as defined in requirements.

    const schemas: DiscoveredSchema[] = [
      {
        integrationId: "github", // Will be overwritten by caller with DB ID
        resource: "issues",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "number", type: "number", nullable: false },
          { name: "title", type: "string", nullable: false },
          { name: "state", type: "string", nullable: false }, // open, closed
          { name: "created_at", type: "date", nullable: false },
          { name: "updated_at", type: "date", nullable: false },
          { name: "author", type: "string", nullable: false }, // username
          { name: "repository", type: "string", nullable: false },
        ]
      },
      {
        integrationId: "github",
        resource: "pull_requests",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "number", type: "number", nullable: false },
          { name: "title", type: "string", nullable: false },
          { name: "state", type: "string", nullable: false },
          { name: "merged", type: "boolean", nullable: false },
          { name: "created_at", type: "date", nullable: false },
          { name: "author", type: "string", nullable: false },
        ]
      },
      {
        integrationId: "github",
        resource: "repos",
        fields: [
          { name: "id", type: "string", nullable: false },
          { name: "name", type: "string", nullable: false },
          { name: "full_name", type: "string", nullable: false },
          { name: "private", type: "boolean", nullable: false },
          { name: "stargazers_count", type: "number", nullable: false },
        ]
      },
      {
        integrationId: "github",
        resource: "commits",
        fields: [
          { name: "sha", type: "string", nullable: false },
          { name: "message", type: "string", nullable: false },
          { name: "author", type: "object", nullable: false },
          { name: "date", type: "date", nullable: false },
          { name: "repo_full_name", type: "string", nullable: false },
        ]
      }
    ];

    return schemas;
  }
};
