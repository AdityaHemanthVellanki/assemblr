
import { UIABI } from "../abi/types";

export class UIRegistry implements UIABI {
  private components: Map<string, any> = new Map();
  private schemas: Map<string, any> = new Map();

  registerComponent(name: string, component: any, schema?: any): void {
    if (this.components.has(name)) {
      console.warn(`UI Component ${name} is already registered. Overwriting.`);
    }
    this.components.set(name, component);
    if (schema) {
      this.schemas.set(name, schema);
    }
    console.log(`[ABI] Registered UI component: ${name}`);
  }

  getComponent(name: string): any {
    return this.components.get(name);
  }
  
  getSchema(name: string): any {
      return this.schemas.get(name);
  }
}
