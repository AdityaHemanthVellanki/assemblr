import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";
import { IntegrationId, IntegrationIdSchema } from "@/lib/toolos/spec";

export async function runResolveIntegrations(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const detected = new Set<IntegrationId>();
  const prompt = ctx.prompt.toLowerCase();
  if (prompt.includes("google") || prompt.includes("gmail") || prompt.includes("drive")) detected.add("google");
  if (prompt.includes("github")) detected.add("github");
  if (prompt.includes("slack")) detected.add("slack");
  if (prompt.includes("notion")) detected.add("notion");
  if (prompt.includes("linear")) detected.add("linear");
  for (const entity of ctx.spec.entities) {
    const parsed = IntegrationIdSchema.safeParse(entity.sourceIntegration);
    if (parsed.success) {
      detected.add(parsed.data);
    }
  }
  let ids = Array.from(detected);
  if (ids.length === 0) {
    ids = ctx.connectedIntegrationIds
      .map((id) => IntegrationIdSchema.safeParse(id))
      .filter((result) => result.success)
      .map((result) => result.data);
  }
  if (ids.length === 0) {
    ids = ["google", "github", "slack", "linear", "notion"];
  }
  const integrations = ids.map((id) => ({
    id,
    capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
  }));
  return { specPatch: { integrations } };
}
