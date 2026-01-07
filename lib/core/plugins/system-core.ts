
import { Plugin, PluginManifest } from "./types";
import { AssemblrABI, CapabilityDefinition } from "../abi/types";
import { INTEGRATIONS } from "@/lib/integrations/capabilities";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/definitions";
import { EXECUTORS, RUNTIMES } from "@/lib/integrations/map";
import { IntegrationExecutor } from "@/lib/execution/types";
import { ExecutionTracer } from "@/lib/observability/tracer";

const MANIFEST: PluginManifest = {
  id: "assemblr-core",
  name: "Assemblr Core System",
  version: "1.0.0",
  type: "integration", // It's a bundle
  compatibleAbiVersions: ["1.0.0"],
  permissionsRequested: ["*"], // Core has full access
};

export class SystemCorePlugin implements Plugin {
  manifest = MANIFEST;

  register(abi: AssemblrABI): void {
    console.log("[SystemCorePlugin] Registering core ecosystem...");

    // 1. Register Integrations
    for (const integration of INTEGRATIONS) {
      if (integration.id === "github") continue;
      
      abi.integrations.register({
        id: integration.id,
        name: integration.name,
        domain: integration.domain,
        authType: integration.requiresAuth ? "oauth" : "none",
        description: `Core integration for ${integration.name}`,
      });
    }

    // 2. Register Capabilities
    for (const capDef of CAPABILITY_REGISTRY) {
      const integrationId = capDef.integrationId;

      // Skip GitHub as it is now a standalone plugin
      if (integrationId === "github") continue;

      const runtime = RUNTIMES[integrationId];
      const executor = EXECUTORS[integrationId];

      let executeFn: ((params: any, context: any) => Promise<any>) | undefined;

      // Strategy A: Use Runtime (Preferred)
      if (runtime && runtime.capabilities[capDef.id]) {
        const runtimeCap = runtime.capabilities[capDef.id];
        executeFn = async (params: any, context: any) => {
            // We need to pass a tracer to the runtime. 
            // Since ABI execute doesn't enforce tracer passing in signature (it's generic params/context),
            // we create a temporary one or rely on context having it?
            // For now, create a localized tracer or pass null if runtime allows.
            // The runtime.execute signature is (params, context, trace).
            const tracer = new ExecutionTracer("run"); 
            // In a real scenario, the trace should be passed via context or a specific parameter in ABI.
            return await runtimeCap.execute(params, context, tracer);
        };
      } 
      // Strategy B: Use Legacy Executor
      else if (executor) {
        executeFn = this.createLegacyAdapter(integrationId, capDef, executor);
      } else {
        console.warn(`[SystemCorePlugin] No runtime or executor found for capability ${capDef.id}`);
      }

      if (!executeFn) {
          // Register without execution (metadata only) - or should we throw?
          // We'll register it, but execution will fail if called.
      }

      const abiCap: CapabilityDefinition = {
        id: capDef.id,
        integrationId: capDef.integrationId,
        description: `Core capability: ${capDef.resource} (${capDef.allowedOperations.join(", ")})`,
        mode: capDef.allowedOperations.includes("read") ? "read" : "action",
        paramsSchema: {}, // TODO: Map supportedFields to Schema
        execute: executeFn as any, // If undefined, the registry will throw on execution attempt
      };

      abi.capabilities.register(abiCap);
    }
  }

  private createLegacyAdapter(
    integrationId: string, 
    capDef: any, 
    executor: IntegrationExecutor
  ): (params: any, context: any) => Promise<any> {
    return async (params: any, context: any) => {
      // Adapt ABI call to Legacy Executor Input
      // Context is expected to be { access_token: string, ... } or similar credentials object
      const result = await executor.execute({
        plan: {
          viewId: "abi_adapter_call",
          integrationId: integrationId,
          capabilityId: capDef.id,
          resource: capDef.resource,
          params: params
        },
        credentials: context // Pass context as credentials
      });

      if (result.status === "error") {
        throw new Error(result.error || "Unknown legacy execution error");
      }

      return result.rows;
    };
  }
}
