import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";
import { IntegrationId, IntegrationIdSchema } from "@/lib/toolos/spec";
import { detectIntegrationsFromText } from "@/lib/integrations/detection";

export async function runResolveIntegrations(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const detected = new Set<IntegrationId>();

  // 1. Semantic detection from the user prompt
  for (const id of detectIntegrationsFromText(ctx.prompt)) {
    detected.add(id);
  }

  // 2. Also pull integration IDs from already-extracted entities
  for (const entity of ctx.spec.entities) {
    const parsed = IntegrationIdSchema.safeParse(entity.sourceIntegration);
    if (parsed.success) {
      detected.add(parsed.data);
    }
  }

  let ids = Array.from(detected);

  // 3. Fallback: only use connected integrations when detection found nothing
  if (ids.length === 0) {
    ids = ctx.connectedIntegrationIds
      .map((id) => IntegrationIdSchema.safeParse(id))
      .filter((result) => result.success)
      .map((result) => result.data);
  }

  // 4. Last resort: default to all Phase 1 integrations
  if (ids.length === 0) {
    ids = ["google", "github", "slack", "linear", "notion"];
  }

  const integrations = ids.map((id) => ({
    id,
    capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
  }));
  return { specPatch: { integrations } };
}
