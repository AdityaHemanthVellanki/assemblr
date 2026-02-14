import { getComposioClient } from "./client";

/**
 * Unwrap the Composio SDK response envelope.
 *
 * The SDK wraps every action result in:
 *   { data: <actual payload>, error: <string|null>, successfull: boolean, successful: boolean, logId: string }
 *
 * We extract `data` so all downstream code (runtime, materialization, views) gets clean data.
 * If the action failed at the Composio level, we throw so it surfaces as an action error.
 */
function unwrapComposioResponse(raw: any, actionId: string): any {
    if (raw === null || raw === undefined) return raw;

    // Detect the SDK envelope by checking for the canonical keys
    const hasEnvelope =
        typeof raw === "object" &&
        !Array.isArray(raw) &&
        ("successfull" in raw || "successful" in raw) &&
        "data" in raw;

    if (!hasEnvelope) {
        // Not wrapped — return as-is (shouldn't normally happen with current SDK)
        return raw;
    }

    const isSuccess = raw.successfull === true || raw.successful === true;
    const data = raw.data;
    const error = raw.error;

    if (!isSuccess && error) {
        // Composio returned an error for this action
        const errorMsg = typeof error === "string" ? error : (error?.message || JSON.stringify(error));
        throw new Error(`Composio action ${actionId} failed: ${errorMsg}`);
    }

    // Detect API-level errors disguised as successful responses
    // Composio sometimes marks actions as "successful" but the data payload is an error object
    if (data && typeof data === "object" && !Array.isArray(data)) {
        if ("message" in data && typeof data.message === "string" && "status_code" in data) {
            const msg = data.message;
            if (msg.includes("Invalid request data") || msg.includes("Missing") || msg.includes("not found")) {
                console.warn(`[Composio] Action ${actionId} returned API error in data: ${msg}`);
                throw new Error(`Composio action ${actionId}: ${msg}`);
            }
        }
    }

    // Log the unwrapping for debugging
    const dataType = Array.isArray(data) ? `array[${data.length}]` : typeof data;
    console.log(`[Composio] Unwrapped ${actionId} response. Data type: ${dataType}`);

    return data;
}

export const executeAction = async (
    entityId: string,
    actionId: string,
    input: Record<string, any>
) => {
    const client = getComposioClient();

    try {
        console.log(`[Composio] Executing action ${actionId} for entity ${entityId}. Params:`, JSON.stringify(input).slice(0, 500));
        const rawOutput = await client.getEntity(entityId).execute({
            actionName: actionId,
            params: input,
        });

        // Unwrap SDK envelope to get clean data
        const output = unwrapComposioResponse(rawOutput, actionId);

        const count = Array.isArray(output) ? output.length : (output ? 1 : 0);
        console.log(`[Composio] Action ${actionId} completed. Records: ${count}. Output type: ${typeof output}`);

        return output;
    } catch (error) {
        console.error(`[Composio] Failed to execute action ${actionId}:`, error);
        throw error;
    }
};

/**
 * Extract the primary array payload from a Composio action's unwrapped data.
 *
 * Many Composio actions return objects that wrap the actual array:
 *   - GitHub repos: { has_more_pages, repositories: [...] }
 *   - GitHub issues: { items: [...], total_count } or [...]
 *   - Notion search: { results: [...] }
 *   - etc.
 *
 * This function finds and returns the main array, regardless of wrapper shape.
 * If the data is already an array, it returns it directly.
 * If the data is a primitive or has no detectable array, returns [data] for non-null data.
 */
export function extractPayloadArray(data: any): any[] {
    if (data === null || data === undefined) return [];

    // Already an array — return directly
    if (Array.isArray(data)) return data;

    // Not an object — wrap in array
    if (typeof data !== "object") return [data];

    // Check if this is a Composio error response (has message + no data arrays)
    if (data.message && typeof data.message === "string" && data.status_code !== undefined) {
        // This is an error object from Composio, not real data
        return [];
    }

    // Find the first array-valued property (common patterns: repositories, items, results, data, records, etc.)
    // Prioritize known keys first
    const priorityKeys = ["repositories", "items", "results", "data", "records", "commits", "issues", "messages", "channels", "users", "pages", "teams", "projects", "cycles", "labels", "states"];
    for (const key of priorityKeys) {
        if (Array.isArray(data[key])) {
            return data[key];
        }
    }

    // Fallback: find any array-valued property
    for (const value of Object.values(data)) {
        if (Array.isArray(value) && value.length > 0) {
            return value;
        }
    }

    // No array found — return the object itself wrapped in an array
    // (single-record responses like "get a repository")
    return [data];
}
