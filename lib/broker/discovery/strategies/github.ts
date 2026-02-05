
import { Octokit } from "octokit";
import { SchemaDefinition } from "../../types";
import { DiscoveryStrategy, DiscoveryContext } from "../types";
import { decrypt } from "../../security";

export class GitHubDiscoveryStrategy implements DiscoveryStrategy {
    async discover(context: DiscoveryContext): Promise<SchemaDefinition[]> {
        const decryptedToken = decrypt(context.accessToken);

        const octokit = new Octokit({
            auth: decryptedToken
        });

        // 1. Verify access & Get User
        const { data: user } = await octokit.rest.users.getAuthenticated();

        // 2. Define standard GitHub Schemas 
        // GitHub API is stable, so we hardcode the known schema but verifying access confirms we can use it.
        // We could fetch list of repos to "populate" metadata or just declare the capability.
        // The Prompt requires "Real execution". If we just say "You can List Repos", that's a schema.

        const repoSchema: SchemaDefinition = {
            resourceType: "repository",
            fields: [
                { name: "id", type: "number", required: true },
                { name: "name", type: "string", required: true },
                { name: "full_name", type: "string", required: true },
                { name: "private", type: "boolean" },
                { name: "description", type: "string" },
                { name: "url", type: "string" },
                { name: "owner", type: "object" }
            ]
        };

        const issueSchema: SchemaDefinition = {
            resourceType: "issue",
            fields: [
                { name: "id", type: "number", required: true },
                { name: "number", type: "number", required: true },
                { name: "title", type: "string", required: true },
                { name: "body", type: "string" },
                { name: "state", type: "string" }, // open/closed
                { name: "assignees", type: "array" },
                { name: "labels", type: "array" },
                { name: "created_at", type: "string" }
            ]
        };

        const prSchema: SchemaDefinition = {
            resourceType: "pull_request",
            fields: [
                { name: "id", type: "number", required: true },
                { name: "number", type: "number", required: true },
                { name: "title", type: "string", required: true },
                { name: "body", type: "string" },
                { name: "state", type: "string" },
                { name: "head", type: "object" },
                { name: "base", type: "object" }
            ]
        };

        // We return these standard schemas.
        // In a more advanced version, we might fetch "custom fields" if GitHub Projects V2 are used.
        return [repoSchema, issueSchema, prSchema];
    }
}
