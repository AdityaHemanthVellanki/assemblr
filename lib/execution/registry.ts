import { normalizeActionId } from "@/lib/spec/action-id";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { getCapability } from "@/lib/capabilities/registry";

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

    console.log(`[RuntimeRegistry] Hydrating ${actions.length} actions for Org ${this.orgId}`);

    for (const actionSpec of actions) {
      await this.registerAction(actionSpec);
    }
  }

  async registerAction(spec: any) {
    if (spec.type === "integration_call" || spec.type === "integration_query") {
      await this.registerIntegrationAction(spec);
    } else {
      // Internal/UI/State actions
      // These are primarily client-side but must be registered to pass validation
      const id = normalizeActionId(spec.id);
      const run = async (trace?: ExecutionTracer) => {
          console.log(`[RuntimeRegistry] Executing internal action ${id} (noop on server)`);
          return {};
      };
      this.actions.set(id, { id, run });
    }
  }

  private async registerIntegrationAction(spec: any) {
    const id = normalizeActionId(spec.id);
    let { capabilityId, integration } = spec.config || {};
    const staticParams = spec.config?.params || {};

    // 1. Infer Integration if missing but capabilityId exists
    if (capabilityId && !integration) {
        const capDef = getCapability(capabilityId);
        if (capDef) {
            integration = capDef.integrationId;
            console.log(`[RuntimeRegistry] Auto-inferred integration '${integration}' for action '${id}' (capability: ${capabilityId})`);
        } else {
            // Fallback: heuristic check (e.g. google_gmail_list -> google)
            const parts = capabilityId.split("_");
            if (parts.length > 0) {
                integration = parts[0];
                console.warn(`[RuntimeRegistry] Heuristic inference used for action '${id}': ${integration}`);
            }
        }
    }

    if (!capabilityId || !integration) {
      console.warn(`[RuntimeRegistry] REJECTED Action ${id}: missing capabilityId or integration (cap=${capabilityId}, int=${integration})`);
      return;
    }

    const runtime = RUNTIMES[integration];
    if (!runtime) {
      console.warn(`[RuntimeRegistry] REJECTED Action ${id}: No runtime found for integration ${integration}`);
      return;
    }

    // Relaxed Check: Runtime capabilities map might be partial or lazy.
    // If the runtime exists, we assume it can handle the capability via `execute`
    // unless strictly typed. 
    // BUT `runtime.capabilities` IS the registry of executable logic.
    const capability = runtime.capabilities[capabilityId];
    if (!capability) {
      console.warn(`[RuntimeRegistry] REJECTED Action ${id}: Capability ${capabilityId} not found in runtime ${integration}. Available: ${Object.keys(runtime.capabilities).join(", ")}`);
      return;
    }

    // Create the executable thunk
    const run = async (trace?: ExecutionTracer) => {
      const tracer = trace || new ExecutionTracer("run");
      
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
    console.log(`[RuntimeRegistry] REGISTERED executable action: ${id}`);
  }

  get(id: string): ExecutableAction | undefined {
    return this.actions.get(normalizeActionId(id));
  }

  has(id: string): boolean {
    return this.actions.has(normalizeActionId(id));
  }

  async executeAction(id: string, params: any, context: { orgId: string; userId: string }) {
      const action = this.get(id);
      if (!action) {
          throw new Error(`Action ${id} not found in registry`);
      }
      // Note: We ignore params passed here for now as they are static in the action definition
      // But in a real runtime, we might merge them.
      // We ignore context passed here because the registry was initialized with orgId
      return action.run();
  }
}
