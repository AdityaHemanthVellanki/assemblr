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
      } else {
        throw new Error(`Unsupported GitHub resource: ${plan.resource}`);
      }

      return {
        viewId: plan.viewId,
        status: "success",
        data,
        timestamp: new Date().toISOString(),
        source: "github",
      };

    } catch (err) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown GitHub error",
        timestamp: new Date().toISOString(),
        source: "github",
      };
    }
  }
}
