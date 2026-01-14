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

export function collectTriggeredActionIds(mutation: any, currentSpec?: ToolSpec): Set<string> {
  const triggered = new Set<string>();
  const addFromNode = (node: any) => {
    if (Array.isArray(node?.events)) {
      for (const e of node.events) {
        if (e?.actionId) triggered.add(normalizeActionId(e.actionId));
      }
    }
  };
  
  // Check explicit triggeredBy (Any type: lifecycle, state_change, internal)
  for (const a of (mutation.actionsAdded ?? [])) {
    if (a.triggeredBy) {
      if (Array.isArray(a.triggeredBy) && a.triggeredBy.length === 0) continue;
      triggered.add(normalizeActionId(a.id));
    }
  }

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
        // Check for empty string values in static options
        if (Array.isArray(c.properties?.options)) {
             for (const opt of c.properties.options) {
                  if (opt && typeof opt === "object" && opt.value === "") {
                       throw new Error(`Select component ${c.id} has an option with empty string value. This is unsafe. Use '__all__' or similar.`);
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
  const triggeredActions = collectTriggeredActionIds(mutation, currentSpec);
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
    if (c.properties?.data && typeof c.properties.data === "string" && c.properties.data.startsWith("{{state.")) {
      const match = c.properties.data.match(/^{{state\.([a-zA-Z0-9_.$-]+)}}$/);
      if (match) stateKeysRead.add(match[1]);
    }
    if (c.type === "text" && typeof c.properties?.content === "string") {
      const matches = c.properties.content.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
      if (matches) {
        matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
      }
    }
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
      const statusKey = assignKey ? `${assignKey}Status` : `${a.id}.status`;
      const errorKey = assignKey ? `${assignKey}Error` : `${a.id}.error`;

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
        stateKeysRead.has(statusKey) ||
        stateKeysRead.has(errorKey) ||
        internalConsumes(statusKey) ||
        internalConsumes(errorKey);

      if (!dataConsumed && !statusConsumed && !isInternal) {
        throw new Error(
          `Integration action ${a.id} is unused: neither data nor status/error are consumed`,
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
    const legacyOps = new Set(["assign", "filter", "map", "derive_state", "derive", "update_state"]);
    if (typeof a.type === "string" && legacyOps.has(a.type)) {
      const op = a.type;
      a.type = ACTION_TYPES.INTERNAL;
      const cfg = a.config ?? {};
      a.config = { operation: op, ...cfg };
      if (op === "assign") {
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

  // 1. NORMALIZE ALL ACTION IDs IMMEDIATELY (Strict Mode)
  for (const a of actions) {
      if (a.id) {
          a.id = normalizeActionId(a.id);
      }
  }

  normalizeLegacyActions(actions);

  // 2. CONVERT INVALID ACTION TYPES (Systemic Fix)
  for (const a of actions) {
    if (a.type === "state_update" || a.type === "state_mutation") {
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
      console.log(`[SystemAutoWiring] Converted action ${a.id} from '${originalType}' to 'internal'`);
    }
  }

  if (!actions.length) return;

  // 3. ENFORCE CANONICAL PIPELINE & FEEDBACK LOOPS
  // "Every integration_call must terminate in UI binding or internal consumer"
  for (const a of actions) {
      if (a.type === "integration_call" && a.config?.assign && a.config?.ephemeral_internal !== true) {
          const rawKey = a.config.assign;
          const statusKey = `${rawKey}Status`;
          const errorKey = `${rawKey}Error`;
          
          // A. Canonical Normalization Action (Required)
          // "Integration Call -> Normalizer -> Filter -> UI"
          // We check if a normalizer exists. If not, we inject one.
          // We look for any internal action that takes rawKey as input.
          const hasConsumer = actions.some((x: any) => 
              x.id !== a.id && 
              x.type === "internal" && 
              (x.inputs?.includes(rawKey) || extractStateDependencies(x).includes(rawKey))
          );

          if (!hasConsumer) {
               const normalizeId = `normalize_${a.id.replace(/^fetch_|^get_/, "")}`;
               // Check collision
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

          // B. Mandatory Feedback Loop (Status/Error)
          // We inject a "Mirroring" action to ensure status is available to shared UI state if needed.
          
          // Check if status/error is consumed by UI or other actions
          let statusConsumed = false;
          
          // Check UI Components
          for (const c of components) {
              if (c.properties?.loadingKey === statusKey || c.properties?.errorKey === errorKey) statusConsumed = true;
              if (c.dataSource?.type === "state" && (c.dataSource.value === statusKey || c.dataSource.value === errorKey)) statusConsumed = true;
              // Check content strings for {{state.key}}
              const propsStr = JSON.stringify(c.properties || {});
              if (propsStr.includes(`{{state.${statusKey}}}`) || propsStr.includes(`{{state.${errorKey}}}`)) statusConsumed = true;
          }

          // Check Internal Actions
          if (!statusConsumed) {
              statusConsumed = actions.some((x: any) => 
                  x.id !== a.id && 
                  (x.inputs?.includes(statusKey) || x.inputs?.includes(errorKey) || 
                   extractStateDependencies(x).includes(statusKey) || extractStateDependencies(x).includes(errorKey))
              );
          }

          if (!statusConsumed) {
               const mirrorId = `mirror_status_${a.id.replace(/^fetch_|^get_/, "")}`;
               // Check collision
               if (!actions.some((x: any) => x.id === mirrorId)) {
                   actions.push({
                       id: mirrorId,
                       type: "workflow", 
                       triggeredBy: [
                           { type: "state_change", stateKey: statusKey },
                           { type: "state_change", stateKey: errorKey }
                       ],
                       steps: [
                           {
                               type: "state_mutation",
                               config: { 
                                   updates: { 
                                       [`debug.${a.id}.status`]: `{{state.${statusKey}}}`,
                                       [`debug.${a.id}.error`]: `{{state.${errorKey}}}`
                                   } 
                               }
                           }
                       ]
                   });
                   console.log(`[SystemAutoWiring] Injected status mirroring action: ${mirrorId}`);
               }
          }
      }
  }

  // 4. FIX COMPONENTS & CHILDREN
  for (const c of components) {
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
          if (!mutation.stateAdded[key]) mutation.stateAdded[key] = null;
          console.log(`[SystemAutoWiring] Auto-bound select ${c.id} to ${key}`);
      }
      
      if (c.properties?.disabledKey && c.properties.disabledKey.startsWith("!")) {
           delete c.properties.disabledKey;
           console.log(`[SystemAutoWiring] Removed illegal disabledKey from ${c.id}`);
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

  const allTriggered = collectTriggeredActionIds(mutation, currentSpec);
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
