import { createEmptyToolSpec, type IntegrationId, type ToolSystemSpec } from "@/lib/toolos/spec";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";

const integrationCapabilities = (id: IntegrationId) =>
  getCapabilitiesForIntegration(id).map((cap) => cap.id);

export const buildSpec = (input: {
  id: string;
  name: string;
  description: string;
  purpose: string;
  integrations: IntegrationId[];
  entities: ToolSystemSpec["entities"];
  actions: ToolSystemSpec["actions"];
  views: ToolSystemSpec["views"];
  query_plans?: ToolSystemSpec["query_plans"];
  answer_contract?: ToolSystemSpec["answer_contract"];
  goal_plan?: ToolSystemSpec["goal_plan"];
  intent_contract?: ToolSystemSpec["intent_contract"];
  triggers?: ToolSystemSpec["triggers"];
  initialFetch?: ToolSystemSpec["initialFetch"];
  dataReadiness?: ToolSystemSpec["dataReadiness"];
}) => {
  const base = createEmptyToolSpec({
    id: input.id,
    name: input.name,
    purpose: input.purpose,
    description: input.description,
    sourcePrompt: input.purpose,
  });

  return {
    ...base,
    integrations: input.integrations.map((id) => ({
      id,
      capabilities: integrationCapabilities(id),
    })),
    entities: input.entities,
    actions: input.actions,
    views: input.views,
    triggers: input.triggers ?? [],
    query_plans: input.query_plans ?? [],
    answer_contract: input.answer_contract ?? {
      entity_type: "item",
      required_constraints: [],
      failure_policy: "empty_over_incorrect",
      list_shape: "array",
    },
    goal_plan: input.goal_plan ?? {
      kind: "ANALYSIS",
      primary_goal: input.purpose,
      sub_goals: [],
      constraints: [],
      derived_entities: [],
    },
    intent_contract: input.intent_contract ?? {
      userGoal: input.purpose,
      successCriteria: ["Analysis complete"],
      implicitConstraints: [],
      hiddenStateRequirements: [],
      subjectivityScore: 0.35,
      heuristics: [],
      requiredEntities: {
        integrations: input.integrations,
        objects: [],
        filters: [],
      },
      forbiddenOutputs: [],
      acceptableFallbacks: [],
    },
    initialFetch: input.initialFetch,
    dataReadiness: input.dataReadiness ?? { requiredEntities: [], minimumRecords: 1 },
    automations: {
      enabled: true,
      capabilities: {
        canRunWithoutUI: true,
        supportedTriggers: (input.triggers ?? []).map((t) => t.type),
        maxFrequency: 1440,
        safetyConstraints: ["approval_required_for_writes"],
      },
    },
    observability: {
      executionTimeline: true,
      recentRuns: true,
      errorStates: true,
      integrationHealth: true,
      manualRetryControls: true,
    },
  };
};
