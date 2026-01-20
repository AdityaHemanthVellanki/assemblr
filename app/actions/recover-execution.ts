
"use server";

import { compileIntent } from "@/lib/ai/planner";
import { getDiscoveredSchemas } from "@/lib/schema/store";
import { findMetrics } from "@/lib/metrics/store";
import { getConnectedIntegrations } from "@/lib/integrations/store";
import { PlannerContext } from "@/lib/ai/types";
import { OrgPolicy } from "@/lib/core/governance";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { materializeSpec } from "@/lib/spec/materializer";

export async function recoverExecution(input: {
  toolId: string;
  failedActionId: string;
  error: string;
  currentSpec: unknown;
  originalPrompt?: string; 
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}) {
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("org_id").eq("id", input.toolId).single();
  const orgId = project?.org_id;

  if (!orgId) {
      console.error("[RecoveryEngine] Cannot recover: Org ID not found for tool", input.toolId);
      return { success: false, error: "Organization not found" };
  }

  console.log(`[RecoveryEngine] Attempting recovery for ${input.failedActionId} in org ${orgId}`);

  try {
    const schemas = await getDiscoveredSchemas(orgId);
    const metrics = await findMetrics(orgId);
    const integrationsMap = await getConnectedIntegrations(orgId);
    const plannerContext: PlannerContext = { integrations: integrationsMap };
    
    // Construct a recovery prompt
    // If we have original prompt, use it. Otherwise construct one.
    const recoveryPrompt = input.originalPrompt || `Fix action ${input.failedActionId} which failed with: ${input.error}`;

    const intent = await compileIntent(
      recoveryPrompt,
      input.history || [],
      plannerContext,
      schemas,
      metrics,
      "repair", // Special mode
      [], // TODO: Pass policies if available
      input.currentSpec as any,
      {
          actionId: input.failedActionId,
          error: input.error,
          originalIntent: {} as any // We don't have the full original compiled intent here easily, but the spec serves as state
      }
    );

    // Materialize the new spec
    const newSpec = materializeSpec(intent as any, input.currentSpec as any);

    return {
        success: true,
        intent,
        newSpec,
        explanation: `I've updated the action configuration to resolve the error.`
    };

  } catch (e) {
      console.error("[RecoveryEngine] Recovery failed:", e);
      return {
          success: false,
          error: e instanceof Error ? e.message : String(e)
      };
  }
}
