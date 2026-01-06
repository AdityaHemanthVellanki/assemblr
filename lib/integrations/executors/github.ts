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
        source: "github",
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
        const owner = (plan.params as any)?.owner as string | undefined;
        const repo = (plan.params as any)?.repo as string | undefined;
        if (!owner || !repo) {
             throw new Error("Repository not specified. Provide both owner and repo (e.g. owner: 'foo', repo: 'bar').");
        }
        const full = `${owner}/${repo}`;
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
