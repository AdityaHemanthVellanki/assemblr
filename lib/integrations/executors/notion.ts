import { IntegrationExecutor, ExecutionResult, ExecutorInput } from "@/lib/execution/types";

export class NotionExecutor implements IntegrationExecutor {
  async execute(input: ExecutorInput): Promise<ExecutionResult> {
    const { plan, credentials } = input;
    const token = credentials.access_token as string;

    if (!token) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: "Missing Notion access token",
        timestamp: new Date().toISOString(),
        source: "notion",
      };
    }

    try {
      let data: unknown[] = [];

      if (plan.resource === "pages" || plan.resource === "search") {
        const res = await fetch("https://api.notion.com/v1/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ page_size: 100 }),
        });
        
        if (!res.ok) throw new Error(`Notion API error: ${res.statusText}`);
        const json = await res.json();
        data = json.results || [];
      } else {
        throw new Error(`Unsupported Notion resource: ${plan.resource}`);
      }

      return {
        viewId: plan.viewId,
        status: "success",
        data,
        timestamp: new Date().toISOString(),
        source: "notion",
      };
    } catch (err) {
      return {
        viewId: plan.viewId,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown Notion error",
        timestamp: new Date().toISOString(),
        source: "notion",
      };
    }
  }
}
