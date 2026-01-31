import { createHash } from "crypto";
import { computeSpecHash } from "@/lib/spec/toolSpec";
import { getCapability } from "@/lib/capabilities/registry";
import {
  ToolSystemSpec,
  ActionSpec,
  WorkflowSpec,
  TriggerSpec,
  ViewSpec,
  StateReducer,
  MemorySpec,
  IntegrationSpec,
  DataReadinessGate,
  AutomationsSpec,
  ObservabilitySpec,
} from "@/lib/toolos/spec";

export type ExecutableTool = {
  spec: ToolSystemSpec;
  actions: Map<string, ActionSpec>;
  workflows: Map<string, WorkflowSpec>;
  triggers: Map<string, TriggerSpec>;
  views: Map<string, ViewSpec>;
};

export type ToolSystemValidation = {
  entitiesResolved: boolean;
  integrationsResolved: boolean;
  actionsBound: boolean;
  workflowsBound: boolean;
  viewsBound: boolean;
  errors: string[];
};

export type CompiledToolArtifact = {
  compiledAt: string;
  specHash: string;
  actions: ActionSpec[];
  workflows: WorkflowSpec[];
  triggers: TriggerSpec[];
  views: ViewSpec[];
  reducers: StateReducer[];
  memory: MemorySpec;
  integrations: IntegrationSpec[];
  dataReadiness?: DataReadinessGate;
  automations?: AutomationsSpec;
  observability?: ObservabilitySpec;
};

export function buildCompiledToolArtifact(spec: ToolSystemSpec): CompiledToolArtifact {
  compileToolSystem(spec);
  return {
    compiledAt: new Date().toISOString(),
    specHash: computeSpecHash(spec),
    actions: spec.actions,
    workflows: spec.workflows,
    triggers: spec.triggers,
    views: spec.views,
    reducers: spec.state.reducers ?? [],
    memory: spec.memory,
    integrations: spec.integrations,
    dataReadiness: spec.dataReadiness,
    automations: spec.automations,
    observability: spec.observability,
  };
}

export function isCompiledToolArtifact(value: any): value is CompiledToolArtifact {
  return (
    value &&
    typeof value === "object" &&
    typeof value.compiledAt === "string" &&
    typeof value.specHash === "string" &&
    Array.isArray(value.actions) &&
    Array.isArray(value.workflows) &&
    Array.isArray(value.triggers) &&
    Array.isArray(value.views) &&
    Array.isArray(value.reducers) &&
    value.memory &&
    Array.isArray(value.integrations)
  );
}

export function validateToolSystem(spec: ToolSystemSpec): ToolSystemValidation {
  const errors: string[] = [];

  let entitiesResolved = spec.entities.length > 0;
  if (!entitiesResolved) {
    errors.push("Entities missing from spec.");
  } else {
    for (const entity of spec.entities) {
      if (!entity.name || entity.name.trim().length === 0) {
        entitiesResolved = false;
        errors.push("Provide a name for each entity.");
        break;
      }
      if (!entity.fields || entity.fields.length === 0) {
        entitiesResolved = false;
        errors.push(`Provide fields for ${entity.name}.`);
      }
      if (!entity.sourceIntegration) {
        entitiesResolved = false;
        errors.push(`Select a source integration for ${entity.name}.`);
      }
    }
  }

  let integrationsResolved = spec.integrations.length > 0;
  if (!integrationsResolved) {
    errors.push("Integrations missing from spec.");
  }
  const integrationIds = new Set(spec.integrations.map((integration) => integration.id));

  let actionsBound = spec.actions.length > 0;
  if (!actionsBound) {
    errors.push("Actions missing from spec.");
  }
  const actionIds = new Set<string>();
  for (const action of spec.actions) {
    if (actionIds.has(action.id)) {
      actionsBound = false;
      errors.push(`Duplicate action id: ${action.id}.`);
    }
    actionIds.add(action.id);
    if (!integrationIds.has(action.integrationId)) {
      integrationsResolved = false;
      actionsBound = false;
      errors.push(`Add ${action.integrationId} integration for ${action.name}.`);
    }
    const cap = getCapability(action.capabilityId);
    if (!cap) {
      actionsBound = false;
      errors.push(`Choose a valid capability for ${action.name}.`);
      continue;
    }
    if (cap.integrationId !== action.integrationId) {
      actionsBound = false;
      errors.push(`Align ${action.name} with a ${action.integrationId} capability.`);
    }
  }

  let workflowsBound = true;
  const workflowIds = new Set<string>();
  for (const workflow of spec.workflows) {
    if (workflowIds.has(workflow.id)) {
      workflowsBound = false;
      errors.push(`Duplicate workflow id: ${workflow.id}.`);
    }
    workflowIds.add(workflow.id);
    for (const node of workflow.nodes) {
      if (node.type === "action" && node.actionId && !actionIds.has(node.actionId)) {
        workflowsBound = false;
        errors.push(`Workflow ${workflow.name} references a missing action.`);
      }
    }
  }
  for (const trigger of spec.triggers) {
    if (trigger.actionId && !actionIds.has(trigger.actionId)) {
      workflowsBound = false;
      errors.push(`Trigger ${trigger.name} references a missing action.`);
    }
    if (trigger.workflowId && !workflowIds.has(trigger.workflowId)) {
      workflowsBound = false;
      errors.push(`Trigger ${trigger.name} references a missing workflow.`);
    }
  }

  let viewsBound = spec.views.length > 0;
  if (!viewsBound) {
    errors.push("Views missing from spec.");
  }
  const entityNames = new Set(spec.entities.map((entity) => entity.name));
  for (const view of spec.views) {
    if (!entityNames.has(view.source.entity)) {
      viewsBound = false;
      errors.push(`Map ${view.name} to a known entity.`);
    }
    for (const actionId of view.actions ?? []) {
      if (!actionIds.has(actionId)) {
        viewsBound = false;
        errors.push(`Remove unknown action ${actionId} from ${view.name}.`);
      }
    }
  }

  return {
    entitiesResolved,
    integrationsResolved,
    actionsBound,
    workflowsBound,
    viewsBound,
    errors,
  };
}

export function compileToolSystem(spec: ToolSystemSpec): ExecutableTool {
  const actionIds = new Set<string>();
  for (const action of spec.actions) {
    if (actionIds.has(action.id)) {
      throw new Error(`Duplicate action id: ${action.id}`);
    }
    actionIds.add(action.id);
    const cap = getCapability(action.capabilityId);
    if (!cap) {
      throw new Error(`Unknown capability ${action.capabilityId}`);
    }
    if (cap.integrationId !== action.integrationId) {
      throw new Error(
        `Capability ${action.capabilityId} does not match integration ${action.integrationId}`,
      );
    }
  }

  const integrations = new Set(spec.integrations.map((i) => i.id));
  for (const action of spec.actions) {
    if (!integrations.has(action.integrationId)) {
      throw new Error(`Integration not registered in tool: ${action.integrationId}`);
    }
  }

  const workflowIds = new Set<string>();
  for (const wf of spec.workflows) {
    if (workflowIds.has(wf.id)) {
      throw new Error(`Duplicate workflow id: ${wf.id}`);
    }
    workflowIds.add(wf.id);
    for (const node of wf.nodes) {
      if (node.type === "action" && node.actionId && !actionIds.has(node.actionId)) {
        throw new Error(`Workflow ${wf.id} references missing action ${node.actionId}`);
      }
    }
  }

  const triggerIds = new Set<string>();
  for (const trigger of spec.triggers) {
    if (triggerIds.has(trigger.id)) {
      throw new Error(`Duplicate trigger id: ${trigger.id}`);
    }
    triggerIds.add(trigger.id);
    if (trigger.actionId && !actionIds.has(trigger.actionId)) {
      throw new Error(`Trigger ${trigger.id} references missing action ${trigger.actionId}`);
    }
    if (trigger.workflowId && !workflowIds.has(trigger.workflowId)) {
      throw new Error(`Trigger ${trigger.id} references missing workflow ${trigger.workflowId}`);
    }
  }

  const viewIds = new Set<string>();
  for (const view of spec.views) {
    if (viewIds.has(view.id)) {
      throw new Error(`Duplicate view id: ${view.id}`);
    }
    viewIds.add(view.id);
  }

  return {
    spec,
    actions: new Map(spec.actions.map((a) => [a.id, a])),
    workflows: new Map(spec.workflows.map((w) => [w.id, w])),
    triggers: new Map(spec.triggers.map((t) => [t.id, t])),
    views: new Map(spec.views.map((v) => [v.id, v])),
  };
}
