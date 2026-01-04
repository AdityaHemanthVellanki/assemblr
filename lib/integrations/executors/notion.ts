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
         // Fallback: Try generic GET request to https://api.notion.com/v1/{resource}
         const res = await fetch(`https://api.notion.com/v1/${plan.resource}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": "2022-06-28",
          },
        });
        
        if (!res.ok) throw new Error(`Notion API error: ${res.statusText}`);
        const json = await res.json();
        
        if (json.results && Array.isArray(json.results)) {
            data = json.results;
        } else {
            data = [json];
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
        error: err instanceof Error ? err.message : "Unknown Notion error",
        timestamp: new Date().toISOString(),
      };
    }
  }
}
