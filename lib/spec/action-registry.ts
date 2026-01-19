import { normalizeActionId } from "./action-id";

export class ActionRegistry {
  private actions = new Map<string, any>();

  constructor(initialActions: any[] = []) {
    this.registerAll(initialActions);
  }

  register(action: any) {
    if (!action || !action.id) return;
    const id = normalizeActionId(action.id);
    this.actions.set(id, action);
  }

  registerAll(actions: any[]) {
    if (!Array.isArray(actions)) return;
    for (const a of actions) {
      this.register(a);
    }
  }

  get(id: string) {
    return this.actions.get(normalizeActionId(id));
  }

  has(id: string) {
    return this.actions.has(normalizeActionId(id));
  }

  /**
   * Throws if the action ID is not found in the registry.
   * Strictly enforcing no dangling references.
   */
  ensureExists(rawId: string, context: string) {
    if (!rawId) return;
    const id = normalizeActionId(rawId);
    if (!this.actions.has(id)) {
      throw new Error(`Action Registry Validation Failed: Action '${id}' (referenced in ${context}) is not registered. All actions must be declared in 'actions'.`);
    }
  }

  getAllIds() {
    return Array.from(this.actions.keys());
  }
}
