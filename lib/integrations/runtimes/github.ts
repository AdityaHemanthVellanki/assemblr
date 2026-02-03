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
      const access = WRITE_CAPABILITIES.has(capabilityId) ? "write" : "read";
      const allowed = checkPermission(perms, this.id, capabilityId, access);
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

    this.capabilities["github_commit_status_list"] = {
      id: "github_commit_status_list",
      integrationId: "github",
      paramsSchema: z.object({
        owner: z.string().optional(),
        repo: z.string(),
        sha: z.string(),
      }),
      autoResolvedParams: ["owner"],
      execute: async (params, context, trace) => {
        const owner = params.owner ?? context.owner;
        if (!owner) throw new Error("Missing owner and unable to infer from context");
        const { repo, sha } = params;
        const { token } = context;
        const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`;
        const startTime = Date.now();
        let status: "success" | "error" = "success";
        try {
          const res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
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
            capabilityId: "github_commit_status_list",
            params: { owner, repo, sha },
            status,
            latency_ms: Date.now() - startTime,
            metadata: { url },
          });
        }
      },
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

    this.capabilities["github_issues_search"] = {
        id: "github_issues_search",
        integrationId: "github",
        paramsSchema: z.object({
            q: z.string(),
            sort: z.string().optional(),
            order: z.enum(["asc", "desc"]).optional(),
            per_page: z.number().optional()
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const query = new URLSearchParams();
            query.append("q", params.q);
            if (params.sort) query.append("sort", params.sort);
            if (params.order) query.append("order", params.order);
            if (params.per_page) query.append("per_page", String(params.per_page));
            const url = `https://api.github.com/search/issues?${query.toString()}`;
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
                return data.items || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "github",
                    capabilityId: "github_issues_search",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_pull_requests_search"] = {
        id: "github_pull_requests_search",
        integrationId: "github",
        paramsSchema: z.object({
            q: z.string(),
            sort: z.string().optional(),
            order: z.enum(["asc", "desc"]).optional(),
            per_page: z.number().optional()
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            const query = new URLSearchParams();
            query.append("q", params.q);
            if (params.sort) query.append("sort", params.sort);
            if (params.order) query.append("order", params.order);
            if (params.per_page) query.append("per_page", String(params.per_page));
            const url = `https://api.github.com/search/issues?${query.toString()}`;
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
                return data.items || [];
            } catch (e) {
                status = "error";
                throw e;
            } finally {
                trace.logIntegrationAccess({
                    integrationId: "github",
                    capabilityId: "github_pull_requests_search",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_pull_request_get"] = {
        id: "github_pull_request_get",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            pull_number: z.number(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo, pull_number } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                    },
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
                    capabilityId: "github_pull_request_get",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_pull_request_reviews_list"] = {
        id: "github_pull_request_reviews_list",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            pull_number: z.number(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo, pull_number } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/reviews`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                    },
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
                    capabilityId: "github_pull_request_reviews_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_pull_request_comments_list"] = {
        id: "github_pull_request_comments_list",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            pull_number: z.number(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo, pull_number } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}/issues/${pull_number}/comments`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                    },
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
                    capabilityId: "github_pull_request_comments_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_repo_get"] = {
        id: "github_repo_get",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                    },
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
                    capabilityId: "github_repo_get",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_repo_collaborators_list"] = {
        id: "github_repo_collaborators_list",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            per_page: z.number().optional(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo } = params;
            const perPage = params.per_page ?? 100;
            const url = `https://api.github.com/repos/${owner}/${repo}/collaborators?per_page=${perPage}`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                    },
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
                    capabilityId: "github_repo_collaborators_list",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url }
                });
            }
        }
    };

    this.capabilities["github_issue_comment"] = {
        id: "github_issue_comment",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            issueNumber: z.number(),
            body: z.string(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo, issueNumber, body } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ body }),
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
                    capabilityId: "github_issue_comment",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url },
                });
            }
        },
    };

    this.capabilities["github_issue_close"] = {
        id: "github_issue_close",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            issueNumber: z.number(),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo, issueNumber } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ state: "closed" }),
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
                    capabilityId: "github_issue_close",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url },
                });
            }
        },
    };

    this.capabilities["github_issue_assign"] = {
        id: "github_issue_assign",
        integrationId: "github",
        paramsSchema: z.object({
            owner: z.string(),
            repo: z.string(),
            issueNumber: z.number(),
            assignees: z.array(z.string()),
        }),
        execute: async (params, context, trace) => {
            const { token } = context;
            const { owner, repo, issueNumber, assignees } = params;
            const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;
            const startTime = Date.now();
            let status: "success" | "error" = "success";
            try {
                const res = await fetch(url, {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/vnd.github.v3+json",
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ assignees }),
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
                    capabilityId: "github_issue_assign",
                    params,
                    status,
                    latency_ms: Date.now() - startTime,
                    metadata: { url },
                });
            }
        },
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

const WRITE_CAPABILITIES = new Set([
  "github_issue_comment",
  "github_issue_close",
  "github_issue_assign",
]);
