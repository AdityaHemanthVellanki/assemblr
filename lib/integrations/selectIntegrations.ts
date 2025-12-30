import type { CapabilityExtraction } from "@/lib/ai/extractCapabilities";
import type { Capability, IntegrationDefinition } from "@/lib/integrations/capabilities";
import { resolveIntegrations } from "@/lib/integrations/resolveIntegrations";

export type SelectIntegrationsResult = {
  selected: IntegrationDefinition[];
  missingCapabilities: Capability[];
  requiresUserInput: boolean;
  followUpQuestions: string[];
  extraction: CapabilityExtraction;
};

export async function selectIntegrations(
  input: { prompt: string; connectedIntegrations: string[] },
  deps: { extract?: (prompt: string) => Promise<CapabilityExtraction> } = {},
): Promise<SelectIntegrationsResult> {
  const extract =
    deps.extract ??
    (async (prompt: string) => {
      const mod = await import("@/lib/ai/extractCapabilities");
      return mod.extractCapabilities(prompt);
    });
  const extraction = await extract(input.prompt);

  const followUpQuestions = extraction.ambiguity_questions;
  if (Array.isArray(followUpQuestions) && followUpQuestions.length > 0) {
    return {
      selected: [],
      missingCapabilities: [],
      requiresUserInput: true,
      followUpQuestions,
      extraction,
    };
  }

  const resolved = resolveIntegrations({
    capabilities: extraction.required_capabilities,
    connectedIntegrations: input.connectedIntegrations,
  });

  return {
    selected: resolved.selected,
    missingCapabilities: resolved.missingCapabilities,
    requiresUserInput: resolved.requiresUserInput,
    followUpQuestions: [],
    extraction,
  };
}
