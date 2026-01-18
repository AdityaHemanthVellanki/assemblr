import { z } from "zod";
import { ACTION_TYPES, type ActionType } from "@/lib/spec/action-types";

// Schema for input to the compiler
const CapabilityActionInputSchema = z.object({
  capabilityId: z.string(),
  integrationId: z.string(),
  params: z.record(z.string(), z.any()).optional(),
  assignKey: z.string().optional(),
  triggeredBy: z.any().optional(), // Flexible trigger definition
});

export type CapabilityActionInput = z.infer<typeof CapabilityActionInputSchema>;

// The output action structure
export type MaterializedAction = {
  id: string;
  type: ActionType;
  config: Record<string, any>;
  triggeredBy?: any;
};

/**
 * Generates a deterministic action ID based on the capability and integration.
 * Format: action_{integration}_{capability}_{hash_of_params_if_needed}
 * 
 * For simplicity and predictability, we'll stick to:
 * action_{integration}_{capability}
 * 
 * If multiple actions use the same capability with different params, 
 * the planner typically assigns them distinct semantic IDs. 
 * However, this compiler enforces a canonical ID structure for the *primary* capability action.
 */
export function generateCapabilityActionId(integrationId: string, capabilityId: string): string {
  // sanitize inputs
  const safeIntegration = integrationId.toLowerCase().replace(/[^a-z0-9]/g, "_");
  const safeCapability = capabilityId.toLowerCase().replace(/[^a-z0-9]/g, "_");
  
  return `action_${safeIntegration}_${safeCapability}`;
}

/**
 * Materializes a runtime action definition from a high-level capability intent.
 * This is the "Compiler" step that translates "I want to use Gmail" into "Here is the executable action object".
 */
export function materializeCapabilityAction(input: CapabilityActionInput): MaterializedAction {
  const { capabilityId, integrationId, params, assignKey, triggeredBy } = input;
  
  const id = generateCapabilityActionId(integrationId, capabilityId);
  
  // Construct the action configuration
  const config: Record<string, any> = {
    capabilityId,
    integration: integrationId, // Explicitly store integration ID for runtime lookup
    params: params || {},
  };

  if (assignKey) {
    config.assign = assignKey;
  }

  // Determine Action Type
  // Default to integration_query if it looks like a data fetch (has assignment), otherwise integration_call
  // But strict mode prefers specific types.
  const type = assignKey ? ACTION_TYPES.INTEGRATION_QUERY : ACTION_TYPES.INTEGRATION_CALL;

  return {
    id,
    type,
    config,
    triggeredBy,
  };
}
