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
      
      // Universal Capability Executor
      const resource = plan.resource || "";
      
      if (resource === "issues") {
        const res = await fetch("https://api.github.com/user/issues?filter=all&state=all&per_page=100", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        data = await res.json();
      } else if (resource === "repos") {
        const res = await fetch("https://api.github.com/user/repos?per_page=100", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (!res.ok) throw new Error(`GitHub API error: ${res.statusText}`);
        data = await res.json();
      } else if (resource === "commits") {
        const owner = (plan.params?.owner as string) || "";
        const repo = (plan.params?.repo as string) || "";
        if (!owner || !repo) {
          // Try to fallback to user repos?
          // For now, strict contract
           return {
            viewId: plan.viewId,
            status: "clarification_needed",
            rows: [],
            error: "Missing owner or repo",
            timestamp: new Date().toISOString(),
            source: "live_api",
          };
        }
        const url = `https://api.github.com/repos/${owner}/${repo}/commits`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (!res.ok) {
          throw new Error(`GitHub API error: ${res.statusText}`);
        }
        const json = await res.json();
        return {
          viewId: plan.viewId,
          status: "success",
          rows: Array.isArray(json) ? json : [json],
          render_hint: "list",
          timestamp: new Date().toISOString(),
          source: "live_api",
        };
      } else if (resource === "user") {
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
        const path = resource.startsWith("/") ? resource.slice(1) : resource;
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
             throw new Error(`Unsupported GitHub resource: ${resource}`);
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
