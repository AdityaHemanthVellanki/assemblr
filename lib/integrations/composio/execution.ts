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
    console.log(`[Composio] Unwrapped ${actionId} response. Data type: ${dataType}. Preview: ${JSON.stringify(data).slice(0, 300)}`);

    return data;
}

/**
 * Known required defaults for Composio actions.
 * Some actions REQUIRE certain parameters (e.g., "idMember", "userId") but the AI
 * may not include them in the generated spec. These are injected as fallback defaults
 * when not already present in the input.
 */
const ACTION_REQUIRED_DEFAULTS: Record<string, Record<string, any>> = {
    // Trello: boards endpoint requires idMember
    TRELLO_GET_MEMBERS_BOARDS_BY_ID_MEMBER: { idMember: "me" },
    // Zoom: meetings endpoint requires userId
    ZOOM_LIST_MEETINGS: { userId: "me" },
    ZOOM_LIST_ALL_RECORDINGS: { userId: "me" },
    // Notion: search requires query to be a string (empty string works as "list all")
    NOTION_SEARCH_NOTION_PAGE: { query: "" },
};

/**
 * Cached GitHub username per entity ID.
 * Used to scope all GitHub search queries to the authenticated user's repos.
 */
const githubUserCache = new Map<string, string>();

export async function getGitHubUsername(entityId: string): Promise<string | null> {
    if (githubUserCache.has(entityId)) {
        return githubUserCache.get(entityId)!;
    }
    try {
        const client = getComposioClient();
        const rawOutput = await client.getEntity(entityId).execute({
            actionName: "GITHUB_GET_THE_AUTHENTICATED_USER",
            params: {},
        });
        // Unwrap SDK envelope
        const data = rawOutput?.data ?? rawOutput;
        const login = data?.login;
        if (login && typeof login === "string") {
            githubUserCache.set(entityId, login);
            console.log(`[Composio] Cached GitHub username for ${entityId}: ${login}`);
            return login;
        }
    } catch (e: any) {
        console.warn(`[Composio] Failed to get GitHub username for ${entityId}:`, e?.message);
    }
    return null;
}

export const executeAction = async (
    entityId: string,
    actionId: string,
    input: Record<string, any>
) => {
    const client = getComposioClient();

    // Inject required defaults that the AI may not have included
    const requiredDefaults = ACTION_REQUIRED_DEFAULTS[actionId];
    if (requiredDefaults) {
        for (const [key, value] of Object.entries(requiredDefaults)) {
            const current = input[key];
            // Inject if missing, null, or wrong type (e.g., query must be string but got number/object)
            const shouldInject = current === undefined || current === null || current === "" ||
                (typeof value === "string" && typeof current !== "string");
            if (shouldInject) {
                input[key] = value;
                console.log(`[Composio] Injected required default: ${key}=${value} for ${actionId} (was: ${JSON.stringify(current)})`);
            }
        }
    }

    try {
        console.log(`[Composio] Executing action ${actionId} for entity ${entityId}. Params:`, JSON.stringify(input).slice(0, 500));
        const rawOutput = await client.getEntity(entityId).execute({
            actionName: actionId,
            params: input,
        });

        // Unwrap SDK envelope to get clean data
        const output = unwrapComposioResponse(rawOutput, actionId);

        // Detailed response structure logging for debugging
        if (output && typeof output === "object" && !Array.isArray(output)) {
            const keys = Object.keys(output);
            const arrayKeys = keys.filter(k => Array.isArray(output[k]));
            const arrayLengths = arrayKeys.map(k => `${k}[${output[k].length}]`);
            console.log(`[Composio] ${actionId} raw data: keys=[${keys.join(",")}], arrays=[${arrayLengths.join(",")}]`);
        } else if (Array.isArray(output)) {
            console.log(`[Composio] ${actionId} raw data: direct array with ${output.length} items`);
        }

        // Unwrap `response_data` wrapper (common in Notion, Outlook, etc.)
        // Composio wraps some API responses in { response_data: { actual_data } }
        let unwrappedOutput = output;
        if (output && typeof output === "object" && !Array.isArray(output) && output.response_data && typeof output.response_data === "object") {
            console.log(`[Composio] Unwrapping response_data for ${actionId}`);
            unwrappedOutput = output.response_data;
        }

        // For non-array outputs, try to extract the payload array immediately
        // GitHub API often returns { total_count, items, ... } or similar wrappers
        let finalOutput = unwrappedOutput;
        if (unwrappedOutput && typeof unwrappedOutput === "object" && !Array.isArray(unwrappedOutput)) {
            const extracted = extractPayloadArray(unwrappedOutput);
            // Only skip extraction if extractPayloadArray just wrapped the original object
            const isJustWrapped = extracted.length === 1 && extracted[0] === unwrappedOutput;
            if (extracted.length > 0 && !isJustWrapped) {
                console.log(`[Composio] Auto-extracted array from ${actionId}: ${extracted.length} items`);
                finalOutput = extracted;
            } else {
                console.log(`[Composio] ${actionId}: no nested array found, using object as-is (keys: ${Object.keys(unwrappedOutput).join(", ")})`);
            }
        }

        const count = Array.isArray(finalOutput) ? finalOutput.length : (finalOutput ? 1 : 0);
        console.log(`[Composio] Action ${actionId} completed. Records: ${count}. Output type: ${Array.isArray(finalOutput) ? `array[${count}]` : typeof finalOutput}`);

        return finalOutput;
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
    const priorityKeys = ["repositories", "items", "results", "data", "records", "commits", "issues", "messages", "channels", "users", "pages", "teams", "projects", "cycles", "labels", "states", "details", "value", "values", "meetings", "conversations", "contacts", "workspaces"];
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
