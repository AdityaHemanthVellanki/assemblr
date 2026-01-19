import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { getCapability } from "@/lib/capabilities/registry";
import { CompiledAction } from "@/lib/compiler/ToolCompiler";

export type ExecutableAction = {
  id: string;
  integration: CompiledAction["integration"];
  capability: string;
  run: (params?: Record<string, any>, trace?: ExecutionTracer) => Promise<any>;
};

export class RuntimeActionRegistry {
  private actions = new Map<string, ExecutableAction>();
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  register(action: CompiledAction) {
    if (!action || !action.id) {
      throw new Error("RuntimeRegistry: Action must have an id");
    }
    if (!action.capability) {
      throw new Error(`[RuntimeRegistry] Action ${action.id} is missing config.capabilityId`);
    }
    const capDef = getCapability(action.capability);
    if (!capDef) {
      throw new Error(`[RuntimeRegistry] Unknown capability '${action.capability}'`);
    }
    if (capDef.integrationId !== action.integration) {
      throw new Error(
        `[RuntimeRegistry] Capability '${action.capability}' does not belong to integration '${action.integration}'`,
      );
    }
    const runtime = RUNTIMES[action.integration];
    if (!runtime) {
      throw new Error(`[RuntimeRegistry] No runtime found for integration ${action.integration}`);
    }
    const executor = runtime.capabilities[action.capability];
    if (!executor) {
      throw new Error(
        `[RuntimeRegistry] Capability ${action.capability} not found in runtime ${action.integration}`,
      );
    }
    const run = async (params?: Record<string, any>, trace?: ExecutionTracer) => {
      const tracer = trace || new ExecutionTracer("run");
      const token = await getValidAccessToken(this.orgId, action.integration);
      const context = await runtime.resolveContext(token);
      if (runtime.checkPermissions) {
        runtime.checkPermissions(action.capability, DEV_PERMISSIONS);
      }
      const resolvedParams = params ?? action.params ?? {};
      return await executor.execute(resolvedParams, context, tracer);
    };
    this.actions.set(action.id, {
      id: action.id,
      integration: action.integration,
      capability: action.capability,
      run,
    });
  }

  registerAll(actions: CompiledAction[]) {
    for (const action of actions) {
      this.register(action);
    }
  }

  get(id: string): ExecutableAction | undefined {
    return this.actions.get(id);
  }

  has(id: string): boolean {
    return this.actions.has(id);
  }

  async execute(id: string, params?: Record<string, any>) {
    const action = this.get(id);
    if (!action) {
      throw new Error(`Action ${id} not found in registry`);
    }
    return action.run(params);
  }
}
