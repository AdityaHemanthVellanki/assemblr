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
        source: "linear",
      };
    }

    try {
      let data: unknown[] = [];

      if (plan.resource === "issues") {
        const query = `query { issues(first: 50) { nodes { id title state { name } createdAt } } }`;
        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ query }),
        });

        if (!res.ok) throw new Error(`Linear API error: ${res.statusText}`);
        const json = await res.json();
        if (json.errors) throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
        
        data = json.data?.issues?.nodes || [];
      } else {
        throw new Error(`Unsupported Linear resource: ${plan.resource}`);
      }

      return {
        viewId: plan.viewId,
        status: "success",
        data,
        timestamp: new Date().toISOString(),
        source: "linear",
      };
    } catch (err) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown Linear error",
        timestamp: new Date().toISOString(),
        source: "linear",
      };
    }
  }
}
