import { IntegrationExecutor, ExecutionResult, ExecutorInput } from "@/lib/execution/types";

export class GitHubExecutor implements IntegrationExecutor {
  async execute(input: ExecutorInput): Promise<ExecutionResult> {
    const { plan, credentials } = input;
    const token = credentials.access_token as string;

    if (!token) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: "Missing GitHub access token",
        timestamp: new Date().toISOString(),
        source: "live_api",
        rows: [],
      };
    }

    try {
      let data: unknown[] = [];
      
      // Map resources to API calls
      if (plan.resource === "issues") {
        const res = await fetch("https://api.github.com/user/issues?filter=all&state=all&per_page=100", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        data = await res.json();
      } else if (plan.resource === "repos") {
        const res = await fetch("https://api.github.com/user/repos?per_page=100", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        data = await res.json();
      } else if (plan.resource === "commits") {
        const requestedRepo = (plan.params as any)?.repo as string | undefined;
        // Resolve repo and owner implicitly from the authenticated context
        const reposRes = await fetch("https://api.github.com/user/repos?per_page=100", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (!reposRes.ok) {
          throw new Error(`GitHub API error: ${reposRes.statusText}`);
        }
        const repos = (await reposRes.json()) as Array<{ full_name: string; name: string }>;
        let full: string | undefined;
        if (requestedRepo && requestedRepo.trim().length > 0) {
          const match = repos.find((r) => r.name.toLowerCase() === requestedRepo.toLowerCase());
          if (!match) {
            return {
              viewId: plan.viewId,
              status: "error",
              error: `I couldn’t find the repository '${requestedRepo}' in your GitHub account.`,
              timestamp: new Date().toISOString(),
              source: "live_api",
              rows: [],
            };
          }
          full = match.full_name; // owner/repo
        } else {
          if (!Array.isArray(repos) || repos.length === 0) {
            return {
              viewId: plan.viewId,
              status: "error",
              error: "No repositories found in your GitHub account.",
              timestamp: new Date().toISOString(),
              source: "live_api",
              rows: [],
            };
          }
          if (repos.length === 1) {
            full = repos[0].full_name;
          } else {
            return {
              viewId: plan.viewId,
              status: "clarification_needed",
              error: "Which repository should I use? You have multiple repositories.",
              timestamp: new Date().toISOString(),
              source: "live_api",
              rows: repos.map((r) => ({ repo: r.name, full_name: r.full_name })),
            };
          }
        }
        // At this point, we have full = "owner/repo"
        const res = await fetch(`https://api.github.com/repos/${full}/commits?per_page=100`, {
           headers: {
               Authorization: `Bearer ${token}`,
               Accept: "application/vnd.github.v3+json",
           },
        });
        
        if (!res.ok) {
            if (res.status === 404) {
                 throw new Error(`Repository '${full}' not found. Please check the name and your permissions.`);
            }
            throw new Error(`GitHub API error: ${res.statusText}`);
        }

        const commits = await res.json();
        
        // @ts-ignore
        if (plan.intent === "metric" || plan.intent === "count") {
            data = [{ count: Array.isArray(commits) ? commits.length : 0 }];
        } else {
            data = Array.isArray(commits) ? commits.map((c: any) => ({
               sha: c.sha,
               message: c.commit.message,
               author: c.commit.author,
               date: c.commit.author.date,
               repo_full_name: full
            })) : [];
        }
      } else if (plan.resource === "user") {
        const res = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        const json = await res.json();
        data = [json]; // Wrap in array
      } else {
        // Fallback: Try to fetch as direct path
        // We allow both "repos/owner/repo" and simple resources like "user" if missed above
        const path = plan.resource.startsWith("/") ? plan.resource.slice(1) : plan.resource;
        const res = await fetch(`https://api.github.com/${path}`, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github.v3+json",
            },
          });
          if (res.ok) {
            const json = await res.json();
             data = Array.isArray(json) ? json : [json];
          } else {
             // If generic fetch fails, throw error
             throw new Error(`Unsupported GitHub resource: ${plan.resource}`);
          }
      }

      return {
        viewId: plan.viewId,
        status: "success",
        rows: data,
        source: "live_api",
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        viewId: plan.viewId,
        status: "error",
        rows: [],
        source: "live_api",
        error: err instanceof Error ? err.message : "Unknown GitHub error",
        timestamp: new Date().toISOString(),
      };
    }
  }
}
