import { IntegrationExecutor, ExecutionResult, ExecutorInput } from "@/lib/execution/types";

export class LinearExecutor implements IntegrationExecutor {
  async execute(input: ExecutorInput): Promise<ExecutionResult> {
    const { plan, credentials } = input;
    const token = credentials.access_token as string;

    if (!token) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: "Missing Linear access token",
        timestamp: new Date().toISOString(),
        source: "live_api",
        rows: [],
      };
    }

    try {
      let data: unknown[] = [];

      // Universal Capability Executor
      const resource = plan.resource || "";
      
      // Map resources to API calls
      const resourceName = resource.toLowerCase();
      // Simple plural to singular mapping for GraphQL field guessing
      // But Linear API usually uses plural like "issues", "teams"
      
      const query = `query { ${resourceName} { nodes { id name createdAt } } }`;
      
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `${token}`,
        },
        body: JSON.stringify({ query }),
      });
      
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      
      if (json.errors) {
        throw new Error(`Linear API error: ${json.errors[0].message}`);
      }
      
      data = json.data?.[resourceName]?.nodes || [];

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
        error: err instanceof Error ? err.message : "Unknown Linear error",
        timestamp: new Date().toISOString(),
      };
    }
  }
}
