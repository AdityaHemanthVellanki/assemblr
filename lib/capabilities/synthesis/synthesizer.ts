import { ActionDetails } from "composio-core";
import { Capability, CapabilityActionType, CapabilityOperation } from "../types";

// Helper to determine capability type from method/path/tags
const determineCapabilityType = (action: ActionDetails): CapabilityActionType => {
    const name = action.name.toLowerCase();

    if (name.includes("list") || name.includes("get_all") || name.includes("search")) {
        return "list";
    }

    if (name.includes("get") || name.includes("retrieve") || name.includes("read")) {
        return "get";
    }

    if (name.includes("create") || name.includes("add") || name.includes("post")) {
        return "create";
    }

    if (name.includes("update") || name.includes("edit") || name.includes("modify") || name.includes("patch")) {
        return "update";
    }

    if (name.includes("delete") || name.includes("remove")) {
        return "delete";
    }

    return "other";
};

const determineAllowedOperations = (type: CapabilityActionType): CapabilityOperation[] => {
    switch (type) {
        case "list":
        case "search":
            return ["read", "filter"];
        case "get":
            return ["read"];
        case "create":
        case "update":
        case "delete":
            return ["write"];
        default:
            return [];
    }
}

export class Synthesizer {
    synthesize(actions: ActionDetails[], integrationId: string): Capability[] {
        return actions.map(action => {
            const type = determineCapabilityType(action);
            const allowedOperations = determineAllowedOperations(type);

            // Infer resource from name (e.g. github_issues_list -> issues)
            // This is a naive heuristic, can be improved.
            const nameParts = action.name.split('_');
            const resource = nameParts.length > 2 ? nameParts[1] : (nameParts[0] || "unknown");

            return {
                id: `${integrationId}:${action.name}`,
                integrationId,
                name: action.displayName || action.name,
                description: action.description || "",
                type,
                parameters: action.parameters,
                originalActionId: action.name,
                resource,
                allowedOperations,
                supportedFields: Object.keys(action.parameters?.properties || {}),
            };
        });
    }
}
