/**
 * Scenario registry.
 *
 * All built-in seed scenarios are registered here.
 */

import type { SeedScenario } from "../types";
import { INCIDENT_RESPONSE_SCENARIO } from "./incident-response";
import { DEAL_ESCALATION_SCENARIO } from "./deal-escalation";

export const SCENARIOS: Record<string, SeedScenario> = {
  "incident-response": INCIDENT_RESPONSE_SCENARIO,
  "deal-escalation": DEAL_ESCALATION_SCENARIO,
};

export function getScenario(name: string): SeedScenario | undefined {
  return SCENARIOS[name];
}

export function listScenarios(): Array<{ name: string; description: string; requiredIntegrations: string[] }> {
  return Object.values(SCENARIOS).map((s) => ({
    name: s.name,
    description: s.description,
    requiredIntegrations: s.requiredIntegrations,
  }));
}
