import { getCapability } from "@/lib/capabilities/registry";
import {
  ToolSystemSpec,
  ActionSpec,
  WorkflowSpec,
  TriggerSpec,
  ViewSpec,
} from "@/lib/toolos/spec";

export type ExecutableTool = {
  spec: ToolSystemSpec;
  actions: Map<string, ActionSpec>;
  workflows: Map<string, WorkflowSpec>;
  triggers: Map<string, TriggerSpec>;
  views: Map<string, ViewSpec>;
};

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
