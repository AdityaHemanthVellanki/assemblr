import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";

export class GitHubRuntime implements IntegrationRuntime {
  id = "github";
  capabilities: Record<string, Capability> = {};

  constructor() {
    this.registerCapabilities();
  }

  private registerCapabilities() {
    this.capabilities["github_commits_list"] = {
      id: "github_commits_list",
      integrationId: "github",
      paramsSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        limit: z.number().optional(),
      }),
      autoResolvedParams: ["owner"],
      execute: async (params, context) => {
        const { owner, repo } = params;
        const { token } = context;
        const url = `https://api.github.com/repos/${owner}/${repo}/commits`;
        const res = await fetch(url, {
          headers: {
             Authorization: `Bearer ${token}`,
             Accept: "application/vnd.github.v3+json"
          }
        });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        return await res.json();
      }
    };

    this.capabilities["github_repos_list"] = {
        id: "github_repos_list",
        integrationId: "github",
        paramsSchema: z.object({
            limit: z.number().optional()
        }),
        execute: async (params, context) => {
            const { token } = context;
            const res = await fetch("https://api.github.com/user/repos?per_page=100", {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json"
                }
            });
            if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
            return await res.json();
        }
    };

    this.capabilities["github_issues_list"] = {
        id: "github_issues_list",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            state: z.enum(["open", "closed", "all"]).optional()
        }),
        autoResolvedParams: ["owner"],
        execute: async (params, context) => {
            const { owner, repo, state } = params;
            const { token } = context;
            const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state || "all"}`;
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json"
                }
            });
            if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
            return await res.json();
        }
    };
  }

  async resolveContext(token: string): Promise<Record<string, any>> {
     const userRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
      });
      if (!userRes.ok) throw new Error("Failed to resolve GitHub user");
      const user = await userRes.json();
      
      return {
        owner: user.login,
        userId: user.id,
        token
      };
  }
}
