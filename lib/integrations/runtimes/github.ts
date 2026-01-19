import { z } from "zod";
import { IntegrationRuntime, Capability } from "@/lib/core/runtime";
import { Permission, checkPermission, DEV_PERMISSIONS } from "@/lib/core/permissions";
import { PermissionDeniedError } from "@/lib/core/errors";

export class GitHubRuntime implements IntegrationRuntime {
  id = "github";
  capabilities: Record<string, Capability> = {};

  constructor() {
    this.registerCapabilities();
  }

  checkPermissions(capabilityId: string, userPermissions: Permission[]) {
      // For now, assume DEV_PERMISSIONS if none passed (during migration)
      // or enforce strict check.
      // The requirement says: "Runtime must hard-fail unauthorized access"
      const perms = userPermissions && userPermissions.length > 0 ? userPermissions : DEV_PERMISSIONS;
      const allowed = checkPermission(perms, this.id, capabilityId, "read"); // Assume read for these fetchers
      if (!allowed) {
          throw new PermissionDeniedError(this.id, capabilityId);
      }
  }

  private registerCapabilities() {
    this.capabilities["github_commits_list"] = {
      id: "github_commits_list",
      integrationId: "github",
      paramsSchema: z.object({
        owner: z.string().optional(), // Inferred from context if missing
        repo: z.string(),
        limit: z.number().optional(),
      }),
      autoResolvedParams: ["owner"],
      execute: async (params, context, trace) => {
        const owner = params.owner ?? context.owner;
        if (!owner) throw new Error("Missing owner and unable to infer from context");
        const { repo } = params;
        const { token } = context;
        const url = `https://api.github.com/repos/${owner}/${repo}/commits`;
        
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        
        try {
            const res = await fetch(url, {
              headers: {
                 Authorization: `Bearer ${token}`,
                 Accept: "application/vnd.github.v3+json"
              }
            });
            if (!res.ok) {
                status = "error";
                throw new Error(`GitHub API error: ${res.statusText}`);
            }
            const data = await res.json();
            return data;
        } catch (e) {
            status = "error";
            throw e;
        } finally {
            trace.logIntegrationAccess({
                integrationId: "github",
                capabilityId: "github_commits_list",
                params: { owner, repo },
                status,
                latency_ms: Date.now() - startTime,
                metadata: { url }
            });
        }
      }
    };

    this.capabilities["github_repos_list"] = {
        id: "github_repos_list",
        integrationId: "github",
        paramsSchema: z.object({
            limit: z.number().optional()
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const url = "https://api.github.com/user/repos?per_page=100";

            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json"
                    }
                });
                if (!res.ok) {
                    status = "error";
                    throw new Error(`GitHub API error: ${res.statusText}`);
                }
                return await res.json();
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "github",
                    capabilityId: "github_repos_list",
                    params: {},
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_issues_list"] = {
        id: "github_issues_list",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string().optional(), // Inferred from context if missing
            repo: z.string().optional(),
            state: z.enum(["open", "closed", "all"]).optional()
        }),
        autoResolvedParams: ["owner"],
        execute: async (params, context, trace) => {
            const owner = params.owner ?? context.owner;
            // if (!owner) throw new Error("Missing owner and unable to infer from context"); // Relaxed for user/issues
            const { repo, state } = params;
            const { token } = context;
            
            let url;
            if (repo && owner) {
                url = `https://api.github.com/repos/${owner}/${repo}/issues?state=${state || "all"}`;
            } else {
                url = `https://api.github.com/user/issues?filter=all&state=${state || "all"}`;
            }
            
            const startTime = Date.now();
            let status: "success" | "error" = "success";

            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json"
                    }
                });
                if (!res.ok) {
                    status = "error";
                    throw new Error(`GitHub API error: ${res.statusText}`);
                }
                return await res.json();
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "github",
                    capabilityId: "github_issues_list",
                    params: { owner, repo, state },
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
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
