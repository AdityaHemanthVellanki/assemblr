import { createHash } from "crypto";
import { Intent } from "@/lib/intent/IntentSchema";
import { getCapability } from "@/lib/capabilities/registry";
import { RuntimeActionRegistry } from "@/lib/execution/registry";
import { compileUI, CompiledUI } from "@/lib/compiler/UICompiler";

export interface CompiledAction {
  id: string;
  integration: "google" | "slack" | "github" | "linear" | "notion";
  capability: string;
  params: Record<string, any>;
  writesTo: string;
  trigger: "onLoad" | "manual";
}

export interface CompiledTool {
  toolId: string;
  orgId: string;
  name: string;
  description: string;
  runtime: {
    actions: CompiledAction[];
    state: Record<string, any>;
  };
  ui: CompiledUI;
}

export function generateActionId(input: {
  orgId: string;
  toolId: string;
  capability: string;
}): string {
  return createHash("sha256")
    .update(`${input.orgId}:${input.toolId}:${input.capability}`)
    .digest("hex");
}

export function isCompiledTool(value: any): value is CompiledTool {
  return (
    value &&
    typeof value === "object" &&
    typeof value.toolId === "string" &&
    typeof value.orgId === "string" &&
    typeof value.name === "string" &&
    value.runtime &&
    Array.isArray(value.runtime.actions) &&
    value.ui &&
    typeof value.ui.type === "string"
  );
}

export function compileTool(input: {
  intent: Intent;
  orgId: string;
  toolId: string;
  name: string;
  description: string;
}): CompiledTool {
  const { intent, orgId, toolId, name, description } = input;
  const capability = getCapability(intent.integration.capability);
  if (!capability) {
    throw new Error(`Unknown capability '${intent.integration.capability}'`);
  }
  if (capability.integrationId !== intent.integration.provider) {
    throw new Error(
      `Capability '${intent.integration.capability}' does not belong to integration '${intent.integration.provider}'`,
    );
  }

  const writesTo = `data_${intent.integration.capability}`;
  const actionId = generateActionId({
    orgId,
    toolId,
    capability: intent.integration.capability,
  });
  const trigger = intent.refresh?.mode === "manual" ? "manual" : "onLoad";
  const action: CompiledAction = {
    id: actionId,
    integration: intent.integration.provider,
    capability: intent.integration.capability,
    params: intent.parameters ?? {},
    writesTo,
    trigger,
  };

  const ui = compileUI({ intent, orgId, toolId, dataKey: writesTo });
  const state = buildInitialState(ui.type, writesTo);

  return {
    toolId,
    orgId,
    name,
    description,
    runtime: {
      actions: [action],
      state,
    },
    ui,
  };
}

export async function runCompiledTool(input: {
  tool: CompiledTool;
  registry: RuntimeActionRegistry;
}): Promise<Record<string, any>> {
  const { tool, registry } = input;
  registry.registerAll(tool.runtime.actions);
  const state = { ...tool.runtime.state };
  for (const action of tool.runtime.actions) {
    if (action.trigger !== "onLoad") continue;
    const result = await registry.execute(action.id, action.params);
    state[action.writesTo] = result;
  }
  return state;
}

function buildInitialState(
  type: CompiledUI["type"],
  dataKey: string,
): Record<string, any> {
  if (type === "table" || type === "list") {
    return { [dataKey]: [] };
  }
  if (type === "card") {
    return { [dataKey]: {} };
  }
  return { [dataKey]: "" };
}
