
import { AgentABI, AgentDefinition } from "../abi/types";

export class AgentRegistry implements AgentABI {
  private agents: Map<string, AgentDefinition> = new Map();

  register(definition: AgentDefinition): void {
    if (this.agents.has(definition.id)) {
      console.warn(`Agent ${definition.id} is already registered. Overwriting.`);
    }
    this.agents.set(definition.id, definition);
    console.log(`[ABI] Registered agent: ${definition.id}`);
  }

  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }
}
