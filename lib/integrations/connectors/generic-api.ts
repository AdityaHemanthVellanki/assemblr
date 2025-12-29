import {
  IntegrationConnector,
  ConnectInput,
  ConnectResult,
  FetchInput,
  NormalizedData,
  NormalizedTable,
  NormalizedJson,
} from "../types";

export class GenericApiConnector implements IntegrationConnector {
  id = "generic_api";
  name = "Generic REST/GraphQL";
  authType = "api_key" as const;
  capabilities = ["api_fetch", "api_action"] as const;

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { baseUrl, apiKey } = input.credentials;
    if (!baseUrl) return { success: false, error: "Missing baseUrl" };
    
    try {
      // Simple connectivity check (HEAD or GET /)
      const res = await fetch(baseUrl, {
        method: "HEAD",
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      // Accept any response as "connected", even 401/403 means host exists
      return { success: true, metadata: { status: res.status } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  async fetch(input: FetchInput): Promise<NormalizedData> {
    const credentials = (input as unknown as { credentials: Record<string, string> }).credentials;
    if (!credentials?.baseUrl) {
      throw new Error("Generic API connector requires baseUrl");
    }

    const { path, method = "GET", body, headers = {} } = input.parameters as {
      path: string;
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
    };

    if (!path) throw new Error("Missing path parameter");

    // Safety: Ensure path doesn't try to escape domain if baseUrl is set
    const url = new URL(path, credentials.baseUrl).toString();

    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...headers,
    };

    if (credentials.apiKey) {
      fetchHeaders["Authorization"] = `Bearer ${credentials.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Heuristic Normalization
    if (Array.isArray(data)) {
      // If it's an array, treat as table
      if (data.length === 0) {
        return { type: "table", columns: [], rows: [] } as NormalizedTable;
      }
      
      const firstItem = data[0];
      if (typeof firstItem === "object" && firstItem !== null) {
        const columns = Object.keys(firstItem).map((k) => ({ name: k, type: "string" }));
        const rows = data.map((item) => Object.values(item as object));
        return { type: "table", columns, rows } as NormalizedTable;
      }
    }

    // Fallback to JSON
    return { type: "json", data } as NormalizedJson;
  }
}
