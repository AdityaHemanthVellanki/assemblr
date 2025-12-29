import { INTEGRATIONS, type Capability, type IntegrationDefinition } from "@/lib/integrations/capabilities";

type ResolveInput = {
  capabilities: Capability[];
  connectedIntegrations: string[];
};

type ResolveResult = {
  selected: IntegrationDefinition[];
  missingCapabilities: Capability[];
  requiresUserInput: boolean;
};

function uniqueCapabilities(list: Capability[]) {
  return Array.from(new Set(list));
}

export function resolveIntegrations(input: ResolveInput): ResolveResult {
  const required = uniqueCapabilities(input.capabilities);

  const connected = INTEGRATIONS.filter((i) => input.connectedIntegrations.includes(i.id));

  const missingCapabilities = required.filter(
    (cap) => !connected.some((i) => i.capabilities.includes(cap)),
  );

  if (missingCapabilities.length > 0) {
    return { selected: [], missingCapabilities, requiresUserInput: true };
  }

  const remaining = new Set(required);
  const selected: IntegrationDefinition[] = [];
  const candidates = [...connected].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  while (remaining.size > 0) {
    let best: { integration: IntegrationDefinition; coverage: number } | null = null;

    for (const integration of candidates) {
      const coverage = integration.capabilities.reduce(
        (count, cap) => (remaining.has(cap) ? count + 1 : count),
        0,
      );
      if (coverage === 0) continue;

      if (
        !best ||
        coverage > best.coverage ||
        (coverage === best.coverage && integration.priority > best.integration.priority) ||
        (coverage === best.coverage &&
          integration.priority === best.integration.priority &&
          integration.id.localeCompare(best.integration.id) < 0)
      ) {
        best = { integration, coverage };
      }
    }

    if (!best) {
      return {
        selected: [],
        missingCapabilities: required,
        requiresUserInput: true,
      };
    }

    selected.push(best.integration);
    for (const cap of best.integration.capabilities) {
      remaining.delete(cap);
    }
  }

  return {
    selected,
    missingCapabilities: [],
    requiresUserInput: false,
  };
}

export type { ResolveInput, ResolveResult };

