import { CompiledIntent } from "@/lib/core/intent";
import { PlannerContext } from "@/lib/ai/types";
import { ToolSpec } from "@/lib/spec/toolSpec";

export type ValidationResult = {
  valid: boolean;
  error?: string;
  correctiveAction?: string;
};

export function validateIntentExecution(
  intent: CompiledIntent, 
  context: PlannerContext,
  currentSpec?: ToolSpec
): ValidationResult {
  if (!intent.execution_graph || intent.execution_graph.nodes.length === 0) {
      return { valid: true };
  }

  const actionsAdded = intent.tool_mutation?.actionsAdded || [];
  const existingActions = (currentSpec as any)?.actions || [];
  
  // Helper to find action
  const findAction = (id: string) => {
      return actionsAdded.find((a: any) => a.id === id) || existingActions.find((a: any) => a.id === id);
  };

  for (const node of intent.execution_graph.nodes) {
    if (node.type === "integration_call") {
      const capabilityId = node.capabilityId;
      if (!capabilityId) {
        return { valid: false, error: `Node ${node.id} missing capabilityId`, correctiveAction: "Clarify intent" };
      }

      // 1. Validate Integration Connection & Capability Existence
      let integrationId: string | undefined;
      let capabilityExists = false;

      // Check connected integrations
      for (const [intId, def] of Object.entries(context.integrations)) {
          if (def.capabilities && def.capabilities.includes(capabilityId)) {
              integrationId = intId;
              capabilityExists = true;
              break;
          }
      }
      
      // Fallback inference if capability list is incomplete or we missed it
      if (!integrationId) {
          integrationId = capabilityId.split("_")[0];
          // We can't verify capabilityExists strictly if we inferred integration, 
          // but we can check if integration is connected.
          if (context.integrations[integrationId]?.connected) {
              // Assume capability exists if integration is connected (soft check)
              // But strictly, we should check capability list. 
              // If capability list is empty/undefined, maybe we assume all?
              // Let's rely on the planner context being accurate.
              if (context.integrations[integrationId].capabilities.length > 0) {
                   // If we have a list and it's not there -> fail
                   capabilityExists = false;
              } else {
                   // No list provided -> optimistic
                   capabilityExists = true; 
              }
          }
      }

      if (!integrationId) {
           return { 
               valid: false, 
               error: `Could not determine integration for capability '${capabilityId}'.`, 
               correctiveAction: "Ensure the capability ID is correct." 
           };
      }

      if (!context.integrations[integrationId]) {
          return { 
              valid: false, 
              error: `Integration '${integrationId}' is not connected.`, 
              correctiveAction: `Please connect ${integrationId} to proceed.` 
          };
      }
      
      if (!context.integrations[integrationId].connected) {
           return { 
              valid: false, 
              error: `Integration '${integrationId}' is known but disconnected.`, 
              correctiveAction: `Reconnect ${integrationId}.` 
          };
      }

      if (!capabilityExists) {
          return { 
              valid: false, 
              error: `Capability '${capabilityId}' is not supported by integration '${integrationId}'.`, 
              correctiveAction: "Use a supported capability." 
          };
      }

      // 2. Validate Action Materialization
      // The node.id should correspond to an action.
      // Or the node should reference an action.
      // If node.id matches an action ID, good.
      const action = findAction(node.id);
      if (!action) {
          // If node.id is not an action ID, maybe it's a step ID.
          // But "integration_call" nodes imply execution.
          // STRICT MODE: Every execution node MUST map to a registered action.
          
          // Check if we can find an action with matching capabilityId in actionsAdded?
          // This covers the case where node.id != action.id but intent is clear.
          const matchingAction = actionsAdded.find((a: any) => a.config?.capabilityId === capabilityId);
          if (!matchingAction) {
               return { 
                   valid: false, 
                   error: `No executable action materialized for node '${node.id}' (Capability: ${capabilityId}).`, 
                   correctiveAction: "Planner failed to materialize action." 
               };
          }
      }
    }
  }

  return { valid: true };
}
