
import { CapabilityABI, CapabilityDefinition } from "../abi/types";
import { ExecutionMiddleware, standardMiddleware, ExecutionContext } from "../abi/middleware";

export class CapabilityRegistry implements CapabilityABI {
  private capabilities: Map<string, CapabilityDefinition> = new Map();
  private middleware: ExecutionMiddleware[] = [...standardMiddleware];

  register(definition: CapabilityDefinition): void {
    if (this.capabilities.has(definition.id)) {
      console.warn(`Capability ${definition.id} is already registered. Overwriting.`);
    }
    this.capabilities.set(definition.id, definition);
    console.log(`[ABI] Registered capability: ${definition.id}`);
  }

  get(id: string): CapabilityDefinition | undefined {
    return this.capabilities.get(id);
  }

  list(): CapabilityDefinition[] {
    return Array.from(this.capabilities.values());
  }

  async execute(capabilityId: string, params: any, context: any): Promise<any> {
    const cap = this.get(capabilityId);
    if (!cap) {
      throw new Error(`Capability ${capabilityId} not found`);
    }

    if (!cap.execute) {
        throw new Error(`Capability ${capabilityId} does not have an execution function (Legacy capability?)`);
    }

    // Compose Middleware
    const composed = this.middleware.reduceRight<() => Promise<any>>(
        (next, mw) => () => mw(cap, params, context as ExecutionContext, next),
        async () => await cap.execute(params, context)
    );

    return await composed();
  }
}
