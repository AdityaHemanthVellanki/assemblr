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
      const capabilityId = plan.capabilityId || "";
      const { params } = plan;
      const resource = plan.resource || "issue"; // Default to issue if missing?

      const isCreate = capabilityId.endsWith("_create");

      // Fallback: If no action specified, assume list if not explicitly create
      const isList = capabilityId.endsWith("_list") || !isCreate;

      if (isCreate) {
        // Mutation
        const title = params?.title || "Untitled Issue";
        const desc = params?.description || "";
        const teamId = params?.teamId || "";

        // Using simple interpolation for now. 
        // Ideally use variables in body: { query, variables }
        const mutation = `mutation { issueCreate(input: { title: "${title}", description: "${desc}", teamId: "${teamId}" }) { success issue { id title } } }`;

        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `${token}`,
          },
          body: JSON.stringify({ query: mutation }),
        });

        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);

        data = [json.data?.issueCreate?.issue].filter(Boolean);

      } else {
        // List Query
        let resourceName = resource.toLowerCase();
        // Pluralize
        if (!resourceName.endsWith("s")) resourceName += "s";

        const query = `query { ${resourceName} { nodes { id name title createdAt } } }`;

        const res = await fetch("https://api.linear.app/graphql", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `${token}`,
          },
          body: JSON.stringify({ query }),
        });

        const json = await res.json();
        if (json.errors) throw new Error(json.errors[0].message);

        data = json.data?.[resourceName]?.nodes || [];
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
        error: err instanceof Error ? err.message : "Unknown Linear error",
        timestamp: new Date().toISOString(),
      };
    }
  }
}
