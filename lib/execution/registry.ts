import { normalizeActionId } from "@/lib/spec/action-id";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";

export type ExecutableAction = {
  id: string;
  run: (trace?: ExecutionTracer) => Promise<any>;
};

export class RuntimeActionRegistry {
  private actions = new Map<string, ExecutableAction>();
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  /**
   * Hydrates actions from a ToolSpec into executable functions.
   * This is the bridge between the Static Spec and the Dynamic Runtime.
   */
  async hydrate(spec: ToolSpec) {
    if ((spec as any).kind !== "mini_app") return; // Only support MiniApps for now

    const mini = spec as any;
    const actions = mini.actions || [];

    for (const actionSpec of actions) {
      if (actionSpec.type === "integration_call" || actionSpec.type === "integration_query") {
        await this.registerIntegrationAction(actionSpec);
      }
      // TODO: Handle other action types (internal, navigation, etc.) if needed here
      // For now, we focus on Integration Actions which are the core failure point.
    }
  }

  private async registerIntegrationAction(spec: any) {
    const id = normalizeActionId(spec.id);
    const { capabilityId, integration } = spec.config || {};
    const staticParams = spec.config?.params || {};

    if (!capabilityId || !integration) {
      console.warn(`[RuntimeRegistry] Action ${id} missing capabilityId or integration`);
      return;
    }

    const runtime = RUNTIMES[integration];
    if (!runtime) {
      console.warn(`[RuntimeRegistry] No runtime found for integration ${integration}`);
      return;
    }

    const capability = runtime.capabilities[capabilityId];
    if (!capability) {
      console.warn(`[RuntimeRegistry] Capability ${capabilityId} not found in runtime ${integration}`);
      return;
    }

    // Create the executable thunk
    const run = async (trace?: ExecutionTracer) => {
      const tracer = trace || new ExecutionTracer("runtime_adhoc");
      
      // 1. Resolve Context (Token)
      // We do this lazily at execution time to ensure freshness
      const token = await getValidAccessToken(this.orgId, integration);
      const context = await runtime.resolveContext(token);

      // 2. Check Permissions
      if (runtime.checkPermissions) {
        runtime.checkPermissions(capabilityId, DEV_PERMISSIONS);
      }

      // 3. Execute
      return await capability.execute(staticParams, context, tracer);
    };

    this.actions.set(id, { id, run });
    console.log(`[RuntimeRegistry] Registered executable action: ${id}`);
  }

  get(id: string): ExecutableAction | undefined {
    return this.actions.get(normalizeActionId(id));
  }

  has(id: string): boolean {
    return this.actions.has(normalizeActionId(id));
  }
}
