
export class ApiError extends Error {
  status: number;
  data?: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function safeFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  
  // Check content length
  const contentLength = res.headers.get("content-length");
  if (contentLength === "0") {
    throw new ApiError("Empty response from server", res.status);
  }

  let json: any;
  try {
    json = await res.json();
  } catch (e) {
    throw new ApiError(`Failed to parse JSON response: ${e instanceof Error ? e.message : String(e)}`, res.status);
  }

  if (!res.ok) {
    // If it's our envelope error
    if (json && typeof json === "object" && json.ok === false && json.error) {
      throw new ApiError(json.error, res.status, json);
    }
    // Legacy or framework error
    throw new ApiError(json?.error || json?.message || res.statusText, res.status, json);
  }

  // Success envelope
  if (json && typeof json === "object" && "ok" in json) {
    if (json.ok) {
      return json.data as T;
    } else {
      throw new ApiError(json.error || "Unknown error in response envelope", res.status, json);
    }
  }

  // Fallback for endpoints not yet migrated to envelope
  return json as T;
}
