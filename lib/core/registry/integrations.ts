
import { IntegrationABI, IntegrationDefinition } from "../abi/types";

export class IntegrationRegistry implements IntegrationABI {
  private integrations: Map<string, IntegrationDefinition> = new Map();

  register(definition: IntegrationDefinition): void {
    if (this.integrations.has(definition.id)) {
      console.warn(`Integration ${definition.id} is already registered. Overwriting.`);
    }
    this.integrations.set(definition.id, definition);
    console.log(`[ABI] Registered integration: ${definition.id}`);
  }

  get(id: string): IntegrationDefinition | undefined {
    return this.integrations.get(id);
  }

  list(): IntegrationDefinition[] {
    return Array.from(this.integrations.values());
  }
}
