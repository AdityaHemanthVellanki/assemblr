import { CompiledIntent } from "../core/intent";
import type { ToolSpec } from "../spec/toolSpec";
import { normalizeActionId } from "../spec/action-id";
import { ActionRegistry } from "../spec/action-registry";
import { ACTION_TYPES, type ActionType } from "../spec/action-types";

const COMPONENT_EVENT_ALIASES: Record<string, string[]> = {
  list: ["onSelect", "onItemClick", "onRowClick"],
  select: ["onChange"],
  dropdown: ["onChange"],
  button: ["onClick"],
};

const SELECT_ALL_VALUE = "__all__";

function normalizeComponentEventType(componentType: string, eventType: string): string {
  const typeKey = typeof componentType === "string" ? componentType.toLowerCase() : "";
  const aliases = COMPONENT_EVENT_ALIASES[typeKey];
  if (!aliases || !eventType) return eventType;
  const lower = String(eventType).toLowerCase();
  const match = aliases.find((a) => a.toLowerCase() === lower);
  return match ?? eventType;
}

export function flattenMiniAppComponents(mini: any): Array<{ pageId: string; component: any }> {
  const out: Array<{ pageId: string; component: any }> = [];
  for (const p of mini?.pages ?? []) {
    for (const c of p.components ?? []) {
      out.push({ pageId: p.id, component: c });
      const stack: any[] = Array.isArray(c.children) ? [...c.children] : [];
      while (stack.length) {
        const node = stack.shift();
        if (!node) continue;
        if (typeof node === "string") continue; // Skip ID references
        out.push({ pageId: p.id, component: node });
        if (Array.isArray(node.children)) stack.push(...node.children);
      }
    }
  }
  return out;
}

export function analyzeActionReachability(mutation: any, currentSpec?: ToolSpec): Set<string> {
  const triggered = new Set<string>();
  const stateListeners = new Map<string, Set<string>>(); // stateKey -> Set<actionId>
  
  // Helper: Index action mutations and listeners
  const allActions = (mutation.actionsAdded ?? []);
  
  // 1. Identify Roots (UI Events, Lifecycle, Explicit State Change)
  const addFromNode = (node: any) => {
    if (Array.isArray(node?.events)) {
      for (const e of node.events) {
        if (e?.actionId) {
            triggered.add(normalizeActionId(e.actionId));
        }
      }
    }
  };

  // 2. Index Listeners & Explicit Triggers
  for (const a of allActions) {
      const id = normalizeActionId(a.id);
      if (a.triggeredBy) {
          const triggers = Array.isArray(a.triggeredBy) ? a.triggeredBy : [a.triggeredBy];
          if (triggers.length > 0) {
              triggered.add(id); // Accept explicit triggers as valid roots
              for (const t of triggers) {
                  if (t.type === "state_change" && t.stateKey) {
                      const k = t.stateKey;
                      if (!stateListeners.has(k)) stateListeners.set(k, new Set());
                      stateListeners.get(k)!.add(id);
                  }
              }
          }
      }
  }

  // 3. Scan UI for roots
  for (const c of (mutation.componentsAdded ?? [])) addFromNode(c);
  for (const p of (mutation.pagesAdded ?? [])) addFromNode(p);
  for (const u of (mutation.componentsUpdated ?? [])) addFromNode(u.patch);
  for (const u of (mutation.pagesUpdated ?? [])) addFromNode(u.patch);
  
  if (currentSpec && (currentSpec as any).kind === "mini_app") {
    const mini: any = currentSpec as any;
    for (const p of mini.pages ?? []) {
      addFromNode(p);
      for (const c of p.components ?? []) {
        const stack: any[] = [c];
        while (stack.length) {
          const n = stack.shift();
          if (!n) continue;
          addFromNode(n);
          if (Array.isArray(n.children)) stack.push(...n.children);
        }
      }
    }
  }

  // 4. Causal Graph Traversal (BFS)
  // Expand reachability: Action A (reachable) -> Mutates S -> Action B (triggered by S) -> Action B is reachable
  const queue = Array.from(triggered);
  const visited = new Set(queue);

  const getMutatedKeys = (action: any): string[] => {
      const keys: string[] = [];
      if (action.type === "state_mutation" || action.type === "internal") {
          const updates = action.config?.updates ?? action.config?.set ?? action.config?.assign;
          if (updates && typeof updates === "object") {
             keys.push(...Object.keys(updates));
          } else if (typeof action.config?.assign === "string") {
             keys.push(action.config.assign);
          }
          if (Array.isArray(action.steps)) {
              for (const step of action.steps) {
                  if (step.type === "state_mutation") {
                      const u = step.config?.updates ?? step.config?.set;
                      if (u) keys.push(...Object.keys(u));
                  }
              }
          }
      }
      return keys;
  };

  while (queue.length > 0) {
      const currentId = queue.shift()!;
      const action = allActions.find((a: any) => normalizeActionId(a.id) === currentId);
      if (!action) continue; // Existing actions not in mutation payload are not traversed for mutation logic here (simplification)

      const mutatedKeys = getMutatedKeys(action);
      for (const key of mutatedKeys) {
          const listeners = stateListeners.get(key);
          if (listeners) {
              for (const listenerId of listeners) {
                  if (!visited.has(listenerId)) {
                      visited.add(listenerId);
                      triggered.add(listenerId);
                      queue.push(listenerId);
                  }
              }
          }
      }
  }

  return triggered;
}

export function validateCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec, options?: { mode?: "create" | "chat" | "modify" }) {
  if (intent.intent_type !== "create" && intent.intent_type !== "modify") return;
  const mutation = intent.tool_mutation;
  if (!mutation) return;

  const existingMini = currentSpec && (currentSpec as any).kind === "mini_app" ? (currentSpec as any) : null;
  const existingComponents = existingMini ? flattenMiniAppComponents(existingMini).map((x) => x.component) : [];
  const existingPages = existingMini ? (existingMini.pages ?? []) : [];
  
  // 1. Validate Component Types
  const allowedTypes = new Set(["container", "text", "button", "input", "select", "dropdown", "list", "table", "card", "heatmap"]);
  const components = mutation.componentsAdded || [];
  for (const c of components) {
    if (!allowedTypes.has(c.type.toLowerCase())) {
      throw new Error(`Unsupported component type: ${c.type}. Allowed: ${Array.from(allowedTypes).join(", ")}`);
    }

    // Fix: Children must be strings
    if (Array.isArray(c.children)) {
        for (const child of c.children) {
            if (typeof child !== "string") {
                 throw new Error(`Component ${c.id} has invalid children. Must be array of string IDs only.`);
            }
        }
    }

    // Fix: itemTemplate.onClick
    if (c.properties?.itemTemplate?.onClick || c.properties?.itemTemplate?.events?.some((e: any) => e.type === "onClick")) {
        throw new Error(`Component ${c.id} defines onClick on itemTemplate. This is invalid. Use 'onSelect' on the List component itself.`);
    }

    // Fix 5: Illegal Negation in disabledKey
    if (c.properties?.disabledKey && c.properties.disabledKey.startsWith("!")) {
        throw new Error(`Invalid disabledKey: '${c.properties.disabledKey}'. Runtime expects a state key, not an expression. Use a derived boolean state variable instead.`);
    }

    // Fix 6: List Item Rendering Contract
    if (c.type.toLowerCase() === "list") {
        const hasItemProps = !!c.properties?.itemProps;
        const hasItemComponent = !!c.properties?.itemComponent;
        const hasChildren = Array.isArray(c.children) && c.children.length > 0;

        if (hasItemProps && (hasItemComponent || hasChildren)) {
             throw new Error(`List component ${c.id} mixes rendering models. Use 'itemProps' exclusively (Recommended) or 'itemComponent'.`);
        }
        if (!hasItemProps && !hasItemComponent && !hasChildren) {
             // Maybe acceptable for empty list? But ideally should have one.
        }
    }

    // Fix 4: Select Binding
    if ((c.type.toLowerCase() === "select" || c.type.toLowerCase() === "dropdown")) {
        // Check for value key if data source is state
        if (c.dataSource?.type === "state") {
            const valKey = c.properties?.optionValueKey;
            if (!valKey) {
                 console.warn(`[PlannerValidation] Warning: Select component ${c.id} binds to state but missing 'optionValueKey'. Ensure the data source contains 'value' or 'id' fields.`);
            }
        }
        if (Array.isArray(c.properties?.options)) {
             for (const opt of c.properties.options) {
                  if (opt && typeof opt === "object") {
                       if (opt.value === "" || opt.value === null || opt.value === undefined) {
                            opt.value = SELECT_ALL_VALUE;
                            console.warn(`[PlannerValidation] Normalized unsafe empty option value on Select ${c.id} to '${SELECT_ALL_VALUE}'.`);
                       }
                  }
             }
        }
        // Enforce explicit state binding
        if (!c.properties?.bindKey && !c.events?.some((e: any) => e.type === "onChange")) {
             throw new Error(`Select component ${c.id} is missing 'bindKey'. It must bind to a state key to be useful.`);
        }
    }
  }

  // 2. Validate Event Wiring (STRICT MODE)
  const actions = mutation.actionsAdded || [];
  const registry = new ActionRegistry(actions);

  normalizeLegacyActions(actions);
  
  if (existingMini && existingMini.actions) {
      registry.registerAll(existingMini.actions);
  }

  // A. Check for "Action defined but unreachable"
  const triggeredActions = analyzeActionReachability(mutation, currentSpec);
  const allActionIds = registry.getAllIds();
  
  for (const id of allActionIds) {
    const isNew = actions.some((a: any) => normalizeActionId(a.id) === id);
    if (isNew && !triggeredActions.has(id)) {
      const action = actions.find((a: any) => normalizeActionId(a.id) === id);
      let repaired = false;
      if (action) {
        repaired = tryAttachComponentTriggerFromSemantics(mutation, action);
        if (repaired) {
          triggeredActions.add(id);
        }
      }
      if (!repaired) {
        // Relaxed rule: If it's effect-only, we might allow it if it's implicitly triggered? 
        // No, effect-only actions still need a trigger.
        if (options?.mode === "create" && intent.intent_type === "create") {
          console.warn(
            `[PlannerValidation] Warning: Action ${id} is defined but never triggered by any component, page event, or explicit trigger (state_change/internal).`,
          );
        } else {
          throw new Error(
            `Action ${id} is defined but never triggered by any component, page event, or explicit trigger (state_change/internal).`,
          );
        }
      }
    }
  }

  // B. Check for "Trigger references missing action" (Strict Mode)
  const checkTrigger = (context: string, event: { actionId?: string }) => {
      if (!event.actionId) return;
      registry.ensureExists(event.actionId, context);
  };

  for (const c of (mutation.componentsAdded ?? [])) {
      if (c.events) c.events.forEach((e: any) => checkTrigger(`Component ${c.id}`, e));
  }
  for (const p of (mutation.pagesAdded ?? [])) {
      if (p.events) p.events.forEach((e: any) => checkTrigger(`Page ${p.id}`, e));
  }
  for (const u of (mutation.pagesUpdated ?? [])) {
      if (u.patch?.events) u.patch.events.forEach((e: any) => checkTrigger(`Page Update ${u.pageId}`, e));
  }
  // Check triggers in existing app components if they were not modified? 
  // We only check new/modified parts to be safe, but Strict Mode implies we shouldn't allow broken refs.
  // For now, focus on the mutation payload.

  // 3. Validate State Usage (Mutations -> UI)
  const stateKeysRead = new Set<string>();
  const collectReadKeys = (c: any) => {
    if (c.dataSource?.type === "state" && c.dataSource.value) {
      stateKeysRead.add(c.dataSource.value);
    }
    if (c.properties?.bindKey) stateKeysRead.add(c.properties.bindKey);
    if (c.properties?.loadingKey) stateKeysRead.add(c.properties.loadingKey);
    if (c.properties?.errorKey) stateKeysRead.add(c.properties.errorKey);
    if (c.properties?.disabledKey) {
        // Handle "derived boolean state" reference or simple key
        stateKeysRead.add(c.properties.disabledKey.replace(/^!/, ""));
    }
    
    // Deep scan properties for {{state.key}}
    const scanObj = (obj: any) => {
        if (!obj || typeof obj !== "object") return;
        for (const val of Object.values(obj)) {
            if (typeof val === "string") {
                const matches = val.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
                if (matches) {
                    matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
                }
            } else if (typeof val === "object") {
                scanObj(val);
            }
        }
    };
    scanObj(c.properties);
  };

  for (const c of components) collectReadKeys(c);
  // Also check componentsUpdated
  if (mutation.componentsUpdated) {
    for (const update of mutation.componentsUpdated) {
      if (update.patch) collectReadKeys({ properties: update.patch.properties, dataSource: update.patch.dataSource });
    }
  }
  if (existingMini) {
    for (const c of existingComponents) collectReadKeys(c);
  }

  for (const a of actions) {
    // Validate Action Types
    const allowedActionTypes = new Set<ActionType>([
      ACTION_TYPES.INTEGRATION_CALL,
      ACTION_TYPES.INTERNAL,
      ACTION_TYPES.NAVIGATION,
      ACTION_TYPES.WORKFLOW,
    ]);
    if (!allowedActionTypes.has(a.type as ActionType)) {
      throw new Error(
        `Action ${a.id} has invalid type '${a.type}'. Allowed: ${Array.from(allowedActionTypes).join(", ")}`,
      );
    }

    if (a.type === "integration_call") {
      const isInternal = a.config?.ephemeral_internal === true;
      const assignKey = a.config?.assign;
      const statusKey = a.effectOnly ? undefined : (assignKey ? `${assignKey}Status` : `${a.id}.status`);
      const errorKey = a.effectOnly ? undefined : (assignKey ? `${assignKey}Error` : `${a.id}.error`);

      const internalConsumes = (key: string | undefined) => {
        if (!key) return false;
        return actions.some((other: any) => {
          if (!other || other.id === a.id) return false;
          if (Array.isArray(other.inputs) && other.inputs.includes(key)) return true;
          const deps = extractStateDependencies(other);
          return deps.includes(key);
        });
      };

      let dataConsumed = false;
      if (assignKey) {
        dataConsumed = stateKeysRead.has(assignKey) || internalConsumes(assignKey);
      } else {
        const dataKey = `${a.id}.data`;
        dataConsumed = stateKeysRead.has(dataKey) || internalConsumes(dataKey);
      }

      const statusConsumed =
        (!!statusKey && stateKeysRead.has(statusKey)) ||
        (!!errorKey && stateKeysRead.has(errorKey)) ||
        internalConsumes(statusKey) ||
        internalConsumes(errorKey);

      if (!dataConsumed && !statusConsumed && !isInternal && !a.effectOnly) {
        throw new Error(
          `Integration action ${a.id} appears to be effect-only. If intentional, mark it as effectOnly: true.`,
        );
      }
    }
    if (a.type === "state_mutation") {
      const updates = a.config?.updates ?? a.config?.set ?? {};
      for (const key of Object.keys(updates)) {
        if (key.startsWith("_") || key.startsWith("__")) continue;
        if (!stateKeysRead.has(key)) {
          console.warn(`[PlannerValidation] Warning: Action ${a.id} mutates state key '${key}', but no component reads this key.`);
        }
      }
    }
  }

  if (existingMini) {
    const existingPairs = new Set(
      existingComponents
        .map((c: any) => {
          const bk = typeof c.properties?.bindKey === "string" ? c.properties.bindKey : "";
          const pid = existingPages.find((p: any) => (p.components ?? []).some((x: any) => x === c))?.id ?? "";
          return `${String(c.type).toLowerCase()}::${pid}::${bk}`;
        })
        .filter((x: string) => !x.endsWith("::")),
    );
    for (const c of components) {
      const bk = typeof c.properties?.bindKey === "string" ? c.properties.bindKey : "";
      if (!bk) continue;
      const pid = c.pageId ?? "";
      const key = `${String(c.type).toLowerCase()}::${pid}::${bk}`;
      if (existingPairs.has(key)) {
         // Downgrade to warning to allow "rebuilding" patterns without crashing
         console.warn(`[PlannerValidation] Duplicate control detected: a ${c.type} already binds to '${bk}' on page '${pid}'.`);
      }
    }
  }
}

function extractStateDependencies(action: any): string[] {
    const deps = new Set<string>();
    const str = JSON.stringify(action.config || {});
    const matches = str.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
    if (matches) {
        matches.forEach(m => deps.add(m.replace("{{state.", "").replace("}}", "")));
    }
    return Array.from(deps);
}

function normalizeLegacyActions(actions: any[]) {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (!a || typeof a !== "object") continue;
    const legacyOps = new Set(["assign", "filter", "map", "derive_state", "derive", "update_state", "state_assign"]);
    if (typeof a.type === "string" && legacyOps.has(a.type)) {
      const op = a.type;
      a.type = ACTION_TYPES.INTERNAL;
      const cfg = a.config ?? {};
      // Preserve semantic intent for system-injected variants
      const semantic =
        op === "state_assign" || op === "update_state" ? "state_update" :
        op === "derive_state" || op === "derive" ? "derive_state" :
        op;
      a.config = { operation: op === "state_assign" ? "assign" : op, __semantic: semantic, ...cfg };
      if (op === "assign" || op === "state_assign") {
        const source = cfg.source ?? cfg.value ?? cfg.from;
        const target = cfg.target ?? cfg.key ?? cfg.to;
        if (source && target && !Array.isArray(a.steps)) {
          a.steps = [{ type: "state_mutation", config: { updates: { [String(target)]: source } } }];
        }
      }
    }
  }
}

export function repairCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec) {
  const mutation = intent.tool_mutation as any;
  if (!mutation) return;
  const actions = mutation.actionsAdded ?? [];
  const components = mutation.componentsAdded || [];

  if (Array.isArray(components)) {
    for (const c of components) {
      if (!c || typeof c !== "object") continue;
      if (c.type === "select" || c.type === "dropdown") {
        if (c.properties && Array.isArray(c.properties.options)) {
          c.properties.options = c.properties.options.map((opt: any) => {
            if (!opt || typeof opt !== "object") return opt;
            if (opt.value === "" || opt.value === null || opt.value === undefined) {
              return { ...opt, value: SELECT_ALL_VALUE };
            }
            return opt;
          });
        }
      }
    }
  }

  if (mutation.stateAdded && typeof mutation.stateAdded === "object") {
    for (const [k, v] of Object.entries(mutation.stateAdded)) {
      if (typeof k === "string" && k.startsWith("filters.") && (v === "" || v === null || v === undefined)) {
        mutation.stateAdded[k] = SELECT_ALL_VALUE;
      }
    }
  }

  applyContainerPatchesToNewComponents(mutation);

  // 1. NORMALIZE ALL ACTION IDs IMMEDIATELY (Strict Mode)
  for (const a of actions) {
      if (a.id) {
          a.id = normalizeActionId(a.id);
      }
  }

  normalizeLegacyActions(actions);

  // 2. CONVERT INVALID ACTION TYPES (Systemic Fix)
  for (const a of actions) {
    if (a.type === "state_update" || a.type === "state_mutation" || a.type === "state_assign") {
      const originalType = a.type;
      a.type = ACTION_TYPES.INTERNAL;
      const updates = a.config?.updates ?? a.config?.set;
      if (updates && !Array.isArray(a.steps)) {
        a.steps = [
          {
            type: "state_mutation",
            config: { updates },
          },
        ];
        delete a.config?.updates;
        delete a.config?.set;
      }
      a.config = { __semantic: (a.config && a.config.__semantic) || (originalType === "state_assign" ? "state_update" : originalType), ...(a.config ?? {}) };
      console.log(`[SystemAutoWiring] Converted action ${a.id} from '${originalType}' to 'internal'`);
    }
  }

  for (const c of components) {
      if (c.properties) {
           for (const [key, val] of Object.entries(c.properties)) {
               if (typeof val === "string" && val.startsWith("state.")) {
                   c.properties[key] = val.replace(/^state\./, "");
               }
           }
      }
      if (c.dataSource?.type === "state" && c.dataSource.value?.startsWith("state.")) {
           c.dataSource.value = c.dataSource.value.replace(/^state\./, "");
      }

      if (Array.isArray(c.events)) {
        c.events = c.events.map((e: any) => {
          if (!e || typeof e !== "object") return e;
          const t = typeof e.type === "string" ? normalizeComponentEventType(c.type, e.type) : e.type;
          return { ...e, type: t };
        });
      }

      if (Array.isArray(c.children)) {
          c.children = c.children.map((child: any) => {
              if (typeof child === "string") return child;
              if (child.id) return child.id;
              return null;
          }).filter(Boolean);
      }

      if (c.properties?.itemTemplate?.onClick) {
          delete c.properties.itemTemplate.onClick;
          console.log(`[SystemAutoWiring] Removed illegal itemTemplate.onClick from ${c.id}`);
      }

      if ((c.type === "select" || c.type === "dropdown") && !c.properties?.bindKey) {
          const key = `filters.${c.id.replace(/^select_|^dropdown_/, "")}`;
          c.properties = c.properties || {};
          c.properties.bindKey = key;
          mutation.stateAdded = mutation.stateAdded || {};
          if (!mutation.stateAdded[key]) mutation.stateAdded[key] = SELECT_ALL_VALUE;
          console.log(`[SystemAutoWiring] Auto-bound select ${c.id} to ${key}`);
      }
      
      if (c.properties?.disabledKey && c.properties.disabledKey.startsWith("!")) {
           delete c.properties.disabledKey;
           console.log(`[SystemAutoWiring] Removed illegal disabledKey from ${c.id}`);
      }
  }

  if (!actions.length) return;

  // 2b. CLASSIFY EFFECT-ONLY ACTIONS (Auto-detect)
  for (const a of actions) {
    const id = String(a.id || "").toLowerCase();
    const semantic = String(a.config?.__semantic || "").toLowerCase();
    const isNavigationType = a.type === ACTION_TYPES.NAVIGATION;
    const effectPatterns = [/^open(_in_.+)?/, /navigate/, /launch/, /^redirect/, /open_in_/, /open$/];
    const matchesEffect =
      isNavigationType ||
      effectPatterns.some((re) => re.test(id)) ||
      effectPatterns.some((re) => re.test(semantic));
    if (a.type === ACTION_TYPES.INTEGRATION_CALL && matchesEffect) {
      a.effectOnly = true;
    }
  }

  for (const a of actions) {
      if (a.type === "integration_call" && !a.effectOnly && a.config?.assign && a.config?.ephemeral_internal !== true) {
          const rawKey = a.config.assign;
          const statusKey = `${rawKey}Status`;
          const errorKey = `${rawKey}Error`;
          
          const hasConsumer = actions.some((x: any) => 
              x.id !== a.id && 
              x.type === "internal" && 
              (x.inputs?.includes(rawKey) || extractStateDependencies(x).includes(rawKey))
          );

          if (!hasConsumer) {
               const normalizeId = `normalize_${a.id.replace(/^fetch_|^get_/, "")}`;
               if (!actions.some((x: any) => x.id === normalizeId)) {
                   const normalizedKey = `${rawKey.replace(/Raw$|Data$/, "")}Items`;
                   actions.push({
                       id: normalizeId,
                       type: "internal",
                       inputs: [rawKey],
                       config: {
                           code: `return ${rawKey}; // System auto-normalization`,
                           assign: normalizedKey
                       },
                       triggeredBy: { type: "state_change", stateKey: rawKey }
                   });
                   console.log(`[SystemAutoWiring] Injected canonical normalizer: ${normalizeId}`);
               }
          }

          let statusConsumed = false;
          
          for (const c of components) {
              if (c.properties?.loadingKey === statusKey || c.properties?.errorKey === errorKey) statusConsumed = true;
              if (c.dataSource?.type === "state" && (c.dataSource.value === statusKey || c.dataSource.value === errorKey)) statusConsumed = true;
              const propsStr = JSON.stringify(c.properties || {});
              if (propsStr.includes(`{{state.${statusKey}}}`) || propsStr.includes(`{{state.${errorKey}}}`)) statusConsumed = true;
          }

          if (!statusConsumed) {
              statusConsumed = actions.some((x: any) => 
                  x.id !== a.id && 
                  (x.inputs?.includes(statusKey) || x.inputs?.includes(errorKey) || 
                   extractStateDependencies(x).includes(statusKey) || extractStateDependencies(x).includes(errorKey))
              );
          }
          
          if (!statusConsumed) {
               const mirrorId = `mirror_status_${a.id.replace(/^fetch_|^get_/, "")}`;
               if (!actions.some((x: any) => x.id === mirrorId)) {
                   actions.push({
                       id: mirrorId,
                       type: "internal",
                       inputs: [statusKey, errorKey],
                       config: {
                           code: `// System auto-mirroring of status\nreturn { status: ${statusKey}, error: ${errorKey} };`,
                           __semantic: "status_mirror"
                       },
                       triggeredBy: { type: "state_change", stateKey: statusKey }
                   });
                   console.log(`[SystemAutoWiring] Injected status mirroring action: ${mirrorId}`);
               }
          }
      }
  }

  const triggeredIds = analyzeActionReachability(mutation, currentSpec);
  
  for (const a of actions) {
      if (a.type === "integration_call" && !triggeredIds.has(normalizeActionId(a.id))) {
           const inputs = a.inputs ?? [];
           if (inputs.length === 1) {
               const inputKey = inputs[0];
               const mutator = actions.find((x: any) => {
                   const m = x.config?.updates ?? x.config?.set ?? x.config?.assign;
                   if (m && typeof m === "object") return Object.keys(m).includes(inputKey);
                   if (x.config?.assign === inputKey) return true;
                   if (Array.isArray(x.steps)) {
                        return x.steps.some((s: any) => {
                             const u = s.config?.updates ?? s.config?.set;
                             return u && Object.keys(u).includes(inputKey);
                        });
                   }
                   return false;
               });
               
               if (mutator) {
                   if (!a.triggeredBy) {
                        a.triggeredBy = { type: "state_change", stateKey: inputKey };
                        console.log(`[SystemAutoWiring] Auto-wired action ${a.id} to trigger on state_change: ${inputKey}`);
                        triggeredIds.add(normalizeActionId(a.id));
                   }
               }
           }
      }
  }

  // 4b. FIX AUTO-WIRED FILTER ACTIONS (ensure internal type and explicit triggers)
  {
    const filterKeys = new Set<string>();
    // Collect filters.* keys from stateAdded
    for (const [k] of Object.entries(mutation.stateAdded ?? {})) {
      if (typeof k === "string" && k.startsWith("filters.")) filterKeys.add(k);
    }
    // Collect bindKey on select/dropdown
    for (const c of components) {
      const bk = c?.properties?.bindKey;
      if (typeof bk === "string" && bk.startsWith("filters.")) filterKeys.add(bk);
    }
    if (filterKeys.size) {
      for (const a of actions) {
        const idStr = String(a.id ?? "");
        const looksLikeFilterUpdater = /filters/.test(idStr) || a.config?.__semantic === "state_update";
        if (!looksLikeFilterUpdater) continue;
        // Normalize type
        const allowed = new Set<ActionType>([
          ACTION_TYPES.INTEGRATION_CALL,
          ACTION_TYPES.INTERNAL,
          ACTION_TYPES.NAVIGATION,
          ACTION_TYPES.WORKFLOW,
        ]);
        if (!allowed.has(a.type as ActionType)) {
          const originalType = a.type;
          a.type = ACTION_TYPES.INTERNAL;
          a.config = { __semantic: "state_update", ...(a.config ?? {}) };
          console.log(`[SystemAutoWiring] Corrected filter action ${a.id} from '${originalType}' to 'internal'`);
        }
        // Ensure explicit state_change triggers for each filter key
        const existing = Array.isArray(a.triggeredBy) ? a.triggeredBy : a.triggeredBy ? [a.triggeredBy] : [];
        const keysAlready = new Set<string>(
          existing.filter((t: any) => t?.type === "state_change" && typeof t.stateKey === "string").map((t: any) => t.stateKey),
        );
        const additions: any[] = [];
        for (const fk of filterKeys) {
          if (!keysAlready.has(fk)) additions.push({ type: "state_change", stateKey: fk });
        }
        if (additions.length) {
          if (!a.triggeredBy) a.triggeredBy = additions.length === 1 ? additions[0] : additions;
          else if (Array.isArray(a.triggeredBy)) a.triggeredBy.push(...additions);
          else a.triggeredBy = [a.triggeredBy, ...additions];
          console.log(`[SystemAutoWiring] Auto-bound ${a.id} to filter state changes: ${Array.from(filterKeys).join(", ")}`);
        }
      }
    }
  }

  autoAttachComponentEventTriggers(mutation, actions);
  inferSelectionSemantics(mutation, actions);

  // 5. AUTO-WIRE FEEDBACK LOOPS TO COMPONENTS
  // Scan components and wire up loading/error keys if missing
  for (const a of actions) {
      if (a.type === "integration_call" && a.config?.assign) {
          const rawKey = a.config.assign;
          const statusKey = `${rawKey}Status`;
          const errorKey = `${rawKey}Error`;
          
          // Find potential consumers (binding to rawKey or a derived key)
          // We can't easily know derived keys without graph analysis, but we can guess common patterns.
          // Or just look for components that *don't* have loadingKey.
          
          for (const c of components) {
              const bindsToData = 
                  c.dataSource?.value === rawKey || 
                  (c.dataSource?.value && c.dataSource.value.includes(rawKey.replace(/Raw$|Data$/, ""))); // Heuristic match
                  
              if (bindsToData) {
                  c.properties = c.properties || {};
                  if (!c.properties.loadingKey) c.properties.loadingKey = statusKey;
                  if (!c.properties.errorKey) c.properties.errorKey = errorKey;
              }
          }
      }
  }
  
  // 6. ENSURE LIFECYCLE TRIGGERS
  // Ensure hydration actions are triggered
  let firstPageId: string | undefined;
  if (Array.isArray(mutation.pagesAdded) && mutation.pagesAdded.length) {
    firstPageId = (mutation.pagesAdded[0] as any).pageId ?? mutation.pagesAdded[0].id;
  }
  if (!firstPageId && currentSpec && (currentSpec as any).kind === "mini_app") {
    firstPageId = ((currentSpec as any).pages ?? [])[0]?.id;
  }

  const allTriggered = analyzeActionReachability(mutation, currentSpec);
  const orphanActions = actions.filter((a: any) => !allTriggered.has(a.id));

  for (const action of orphanActions) {
    const stateDeps = extractStateDependencies(action);
    if (stateDeps.length > 0) {
      action.triggeredBy = { type: "state_change", stateKey: stateDeps[0] };
      console.log(`[SystemAutoWiring] Auto-bound ${action.id} to state_change(${stateDeps[0]})`);
    } else if (action.type === "integration_call" && firstPageId) {
        // Hydration
        action.triggeredBy = { type: "lifecycle", event: "onPageLoad" };
        mutation.pagesUpdated = mutation.pagesUpdated ?? [];
        mutation.pagesUpdated.push({
            pageId: firstPageId,
            patch: {
                events: [
                    { type: "onPageLoad", actionId: action.id, args: { autoAttached: true, reason: "system_hydration" } }
                ]
            }
        });
        console.log(`[SystemAutoWiring] Auto-bound ${action.id} to onPageLoad`);
    }
  }
  // 7. CONVERT EXPLICIT LIFECYCLE TRIGGERS TO PAGE EVENTS
  // If an action has triggeredBy: { type: "lifecycle", event: "onPageLoad" },
  // we must ensure it is actually wired to the page event.
  if (firstPageId) {
      for (const action of actions) {
          const triggers = Array.isArray(action.triggeredBy) ? action.triggeredBy : (action.triggeredBy ? [action.triggeredBy] : []);
          const lifecycleTrigger = triggers.find((t: any) => t.type === "lifecycle" && t.event === "onPageLoad");
          
          if (lifecycleTrigger) {
              mutation.pagesUpdated = mutation.pagesUpdated ?? [];
              let pageUpdate = mutation.pagesUpdated.find((u: any) => u.pageId === firstPageId);
              if (!pageUpdate) {
                  pageUpdate = { pageId: firstPageId, patch: { events: [] } };
                  mutation.pagesUpdated.push(pageUpdate);
              }
              pageUpdate.patch.events = pageUpdate.patch.events ?? [];
              const alreadyWired = pageUpdate.patch.events.some((e: any) => e.type === "onPageLoad" && normalizeActionId(e.actionId) === normalizeActionId(action.id));
              
              if (!alreadyWired) {
                  pageUpdate.patch.events.push({ 
                      type: "onPageLoad", 
                      actionId: action.id, 
                      args: { autoAttached: true, reason: "lifecycle_trigger" } 
                  });
                  console.log(`[SystemAutoWiring] Converted explicit lifecycle trigger for ${action.id} to onPageLoad event on ${firstPageId}`);
              }
          }
      }
  }

  ensureEveryActionHasTrigger(mutation);
}

function applyContainerPatchesToNewComponents(mutation: any) {
  const updates = Array.isArray(mutation.containerPropsUpdated) ? mutation.containerPropsUpdated : [];
  if (!updates.length) return;

  const remaining: any[] = [];
  const components = mutation.componentsAdded ?? [];
  const pages = mutation.pagesAdded ?? [];

  const byId = new Map<string, any>();
  for (const c of components) {
    if (c && typeof c.id === "string") {
      byId.set(c.id, c);
    }
  }

  const applyPatchToTree = (node: any, targetId: string, patch: any): boolean => {
    if (!node || typeof node !== "object") return false;
    if (node.id === targetId) {
      node.properties = { ...(node.properties || {}), ...(patch || {}) };
      return true;
    }
    if (Array.isArray(node.children)) {
      for (const ch of node.children) {
        if (applyPatchToTree(ch, targetId, patch)) return true;
      }
    }
    return false;
  };

  for (const upd of updates) {
    if (!upd) continue;
    const id = typeof upd.id === "string" ? upd.id : undefined;
    const patch = upd.propertiesPatch || {};
    if (!id) {
      remaining.push(upd);
      continue;
    }
    let inlined = false;
    const direct = byId.get(id);
    if (direct) {
      direct.properties = { ...(direct.properties || {}), ...(patch) };
      inlined = true;
    } else {
      for (const p of pages) {
        if (!p || !Array.isArray(p.components)) continue;
        for (const root of p.components) {
          if (applyPatchToTree(root, id, patch)) {
            inlined = true;
            break;
          }
        }
        if (inlined) break;
      }
    }
    if (!inlined) {
      remaining.push(upd);
    }
  }

  if (remaining.length) {
    mutation.containerPropsUpdated = remaining;
  } else {
    delete mutation.containerPropsUpdated;
  }
}

function ensureEveryActionHasTrigger(mutation: any) {
  const actions = mutation.actionsAdded ?? [];
  for (const action of actions) {
       const hasTriggers = !!action.triggeredBy &&
          (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));

       if (!hasTriggers) {
           // Final safety net: Just bind to internal/manual to satisfy Strict Mode
           action.triggeredBy = { type: "internal", reason: "system_safety_net" };
           console.warn(`[SystemSafetyNet] Action ${action.id} had no trigger. Auto-bound to internal(system_safety_net) to prevent crash.`);
       }
  }
}

function autoAttachComponentEventTriggers(mutation: any, actions: any[]) {
  const components = mutation.componentsAdded ?? [];
  const findAction = (rawId: string) => {
    const id = normalizeActionId(rawId);
    return actions.find((a: any) => normalizeActionId(a.id) === id);
  };
  for (const c of components) {
    if (!Array.isArray(c.events)) continue;
    for (const e of c.events) {
      if (!e || !e.actionId) continue;
      const action = findAction(e.actionId);
      if (!action) continue;
      const hasTriggers =
        !!action.triggeredBy &&
        (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
      if (hasTriggers) continue;
      const eventType = typeof e.type === "string" ? normalizeComponentEventType(c.type, e.type) : e.type;
      const trigger = { type: "component_event", componentId: c.id, event: eventType };
      if (!action.triggeredBy) {
        action.triggeredBy = trigger;
      } else if (Array.isArray(action.triggeredBy)) {
        action.triggeredBy.push(trigger);
      } else {
        action.triggeredBy = [action.triggeredBy, trigger];
      }
    }
  }
}

function inferSelectionSemantics(mutation: any, actions: any[]) {
  const components = mutation.componentsAdded ?? [];
  const listComponents = components.filter(
    (c: any) => c && typeof c.type === "string" && c.type.toLowerCase() === "list",
  );
  if (!listComponents.length) return;
  const targetList = listComponents[listComponents.length - 1];
  targetList.events = targetList.events ?? [];
  for (const action of actions) {
    if (!action || !action.id) continue;
    const hasTriggers =
      !!action.triggeredBy &&
      (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
    if (hasTriggers) continue;
    const normalizedId = normalizeActionId(action.id);
    const patternMatch =
      normalizedId.startsWith("select_") || normalizedId.startsWith("open_") || normalizedId.startsWith("view_");
    if (!patternMatch) continue;
    const canonicalEvent = normalizeComponentEventType(targetList.type, "onSelect");
    const alreadyWired =
      Array.isArray(targetList.events) &&
      targetList.events.some(
        (e: any) => e && normalizeActionId(e.actionId) === normalizedId,
      );
    if (!alreadyWired) {
      targetList.events.push({ type: canonicalEvent, actionId: action.id });
    }
    const trigger = { type: "component_event", componentId: targetList.id, event: canonicalEvent };
    if (!action.triggeredBy) {
      action.triggeredBy = trigger;
    } else if (Array.isArray(action.triggeredBy)) {
      action.triggeredBy.push(trigger);
    } else {
      action.triggeredBy = [action.triggeredBy, trigger];
    }
  }
}

function tryAttachComponentTriggerFromSemantics(mutation: any, action: any): boolean {
  const hasTriggers =
    !!action.triggeredBy &&
    (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
  if (hasTriggers) return true;
  inferSelectionSemantics(mutation, [action]);
  autoAttachComponentEventTriggers(mutation, [action]);
  const after =
    !!action.triggeredBy &&
    (!Array.isArray(action.triggeredBy) || (Array.isArray(action.triggeredBy) && action.triggeredBy.length > 0));
  return after;
}
