
import { executeAction } from "@/lib/integrations/composio/execution";
import { IntegrationRuntime } from "@/lib/execution/types";

export class ComposioRuntime implements IntegrationRuntime {
    id = "composio";
    isComposio = true; // Special flag for runtime.ts to verify

    // Proxy to intercept capability access and return an executor
    get capabilities() {
        return new Proxy({}, {
            get: (_target, prop) => {
                const fullId = String(prop);
                // Capability IDs are formatted as "integration:action"
                // Composio action IDs (from synthesized metadata) are already prefixed with APP_
                // Examples: "github:GITHUB_GET_REPO", "linear:LINEAR_LIST_ISSUES"
                // The executor needs the part after the colon.
                const actionId = fullId.includes(":") ? fullId.split(":")[1] : fullId;

                return {
                    execute: async (input: any, context: any, _tracer: any) => {
                        // Ensure orgId is present in context
                        const entityId = context.orgId;
                        if (!entityId) {
                            throw new Error("Composio execution requires orgId in context");
                        }
                        return await executeAction(entityId, actionId, input);
                    }
                }
            }
        }) as Record<string, any>;
    }

    async resolveContext(params: any): Promise<Record<string, any>> {
        // params is the orgId passed from runtime.ts
        return { orgId: params };
    }
}
