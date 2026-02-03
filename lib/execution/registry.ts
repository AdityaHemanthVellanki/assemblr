import { RUNTIMES } from "@/lib/integrations/map";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { ExecutionTracer } from "@/lib/observability/tracer";
import { DEV_PERMISSIONS } from "@/lib/core/permissions";
import { getCapability } from "@/lib/capabilities/registry";
import { CompiledTool, ToolSection, CapabilityInvocation, IntegrationId } from "@/lib/compiler/CompiledTool";

export type ExecutableAction = {
  id: string;
  integration: IntegrationId;
  capabilityId: string;
  run: (params?: Record<string, any>, trace?: ExecutionTracer) => Promise<any>;
};

export class RuntimeActionRegistry {
  private actions = new Map<string, ExecutableAction>();
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  register(tool: CompiledTool) {
    if (!Array.isArray(tool.sections) || tool.sections.length === 0) {
      throw new Error("RuntimeRegistry: Tool must include sections");
    }
    for (const section of tool.sections) {
      this.registerSection(section);
    }
  }

  registerAll(tools: CompiledTool[]) {
    for (const tool of tools) {
      this.register(tool);
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

  private registerSection(section: ToolSection) {
    console.log(`[RuntimeRegistry] Hydrating section: ${section.integration}`);
    if (!section.capabilities || section.capabilities.length === 0) {
      throw new Error(`[RuntimeRegistry] Section ${section.id} has no capabilities`);
    }
    for (const cap of section.capabilities) {
      this.registerCapability(section, cap);
    }
  }

  private registerCapability(section: ToolSection, capability: CapabilityInvocation) {
    const capDef = getCapability(capability.id);
    if (!capDef) {
      throw new Error(`[RuntimeRegistry] Unknown capability '${capability.id}'`);
    }
    if (capDef.integrationId !== section.integration) {
      throw new Error(
        `[RuntimeRegistry] Capability '${capability.id}' does not belong to integration '${section.integration}'`,
      );
    }
    const runtime = RUNTIMES[section.integration];
    if (!runtime) {
      throw new Error(`[RuntimeRegistry] No runtime found for integration ${section.integration}`);
    }
    const executor = runtime.capabilities[capability.id];
    if (!executor) {
      throw new Error(
        `[RuntimeRegistry] Capability ${capability.id} not found in runtime ${section.integration}`,
      );
    }
    const run = async (params?: Record<string, any>, trace?: ExecutionTracer) => {
      const envType = process.env.RUNTIME_ENV;
      if (!envType || !["REAL_RUNTIME", "DEV_WITH_REAL_CREDS", "TEST_WITH_REAL_CREDS"].includes(envType)) {
        throw new Error("Execution blocked: RUNTIME_ENV must be set to REAL_RUNTIME, DEV_WITH_REAL_CREDS, or TEST_WITH_REAL_CREDS.");
      }
      const tracer = trace || new ExecutionTracer("run");
      const token = await getValidAccessToken(this.orgId, section.integration);
      const context = await runtime.resolveContext(token);
      if (runtime.checkPermissions) {
        runtime.checkPermissions(capability.id, DEV_PERMISSIONS);
      }
      const resolvedParams = params ?? capability.params ?? {};
      return await executor.execute(resolvedParams, context, tracer);
    };
    this.actions.set(capability.actionId, {
      id: capability.actionId,
      integration: section.integration,
      capabilityId: capability.id,
      run,
    });
  }
}
