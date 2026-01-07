
import { Plugin, PluginManifest } from "@/lib/core/plugins/types";
import { AssemblrABI } from "@/lib/core/abi/types";
import { z } from "zod";
import { Permission, checkPermission, DEV_PERMISSIONS } from "@/lib/core/permissions";
import { PermissionDeniedError } from "@/lib/core/errors";

export class GitHubPlugin implements Plugin {
  manifest: PluginManifest = {
    id: "github-integration",
    name: "GitHub Integration",
    version: "1.0.0",
    description: "Official GitHub integration for Assemblr",
    type: "integration",
    permissionsRequested: ["integration:github"],
    compatibleAbiVersions: ["1.0.0"],
    entryPoint: "builtin"
  };

  async load(): Promise<void> {
    console.log("[GitHubPlugin] Loaded");
  }

  async enable(): Promise<void> {
    console.log("[GitHubPlugin] Enabled");
  }

  async disable(): Promise<void> {
    console.log("[GitHubPlugin] Disabled");
  }

  register(abi: AssemblrABI): void {
    // 1. Register Integration
    abi.integrations.register({
      id: "github",
      name: "GitHub",
      domain: "engineering",
      authType: "oauth"
    });

    // 2. Register Capabilities
    this.registerCapabilities(abi);
  }

  private registerCapabilities(abi: AssemblrABI) {
    // GitHub Commits List
    abi.capabilities.register({
      id: "github_commits_list",
      integrationId: "github",
      description: "List commits for a repository",
      mode: "read",
      paramsSchema: z.object({
        owner: z.string(),
        repo: z.string(),
        limit: z.number().optional(),
      }),
      execute: async (params, context) => {
        // Resolve Context if needed, or assume Context passed has token
        // In the new ABI, auth is handled by the executor/middleware mostly, 
        // but we need the token.
        // The context.token might be populated by an Auth Middleware or passed down.
        // For now, assume context has what we need or we resolve it.
        // Actually, ABI execution context is generic.
        // We might need to ensure the token is injected.
        
        const { owner, repo } = params;
        const token = context.token; // Assume token is present in context

        if (!token) throw new Error("GitHub execution requires token");

        const url = `https://api.github.com/repos/${owner}/${repo}/commits`;
        
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github.v3+json"
            }
        });
        
        if (!res.ok) {
            throw new Error(`GitHub API error: ${res.statusText}`);
        }
        return await res.json();
      }
    });

    // GitHub Repos List
    abi.capabilities.register({
        id: "github_repos_list",
        integrationId: "github",
        description: "List repositories for the authenticated user",
        mode: "read",
        paramsSchema: z.object({
            limit: z.number().optional()
        }),
        execute: async (params, context) => {
            const token = context.token;
            if (!token) throw new Error("GitHub execution requires token");

            const url = "https://api.github.com/user/repos?per_page=100";
            const res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/vnd.github.v3+json"
                }
            });
            if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
            return await res.json();
        }
    });

    // GitHub Issues List
    abi.capabilities.register({
        id: "github_issues_list",
        integrationId: "github",
        description: "List issues for a repository",
        mode: "read",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            state: z.enum(["open", "closed", "all"]).optional()
        }),
        execute: async (params, context) => {
            const { owner, repo, state } = params;
            const token = context.token;
            if (!token) throw new Error("GitHub execution requires token");

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
    });
  }
}
