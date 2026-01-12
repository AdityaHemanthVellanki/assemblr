import { CompiledIntent } from "@/lib/core/intent";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import { normalizeActionId } from "@/lib/spec/action-id";

export function flattenMiniAppComponents(mini: any): Array<{ pageId: string; component: any }> {
  const out: Array<{ pageId: string; component: any }> = [];
  for (const p of mini?.pages ?? []) {
    for (const c of p.components ?? []) {
      out.push({ pageId: p.id, component: c });
      const stack: any[] = Array.isArray(c.children) ? [...c.children] : [];
      while (stack.length) {
        const node = stack.shift();
        if (!node) continue;
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

export function validateCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec) {
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

    // Guardrail: Select/Dropdown Must Have Value Key for Object Options
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
    }
  }

  // 2. Validate Event Wiring (STRICT MODE)
  const actions = mutation.actionsAdded || [];
  const actionIds = new Set(actions.map((a: any) => normalizeActionId(a.id)));
  
  if (existingMini && existingMini.actions) {
      existingMini.actions.forEach((a: any) => actionIds.add(normalizeActionId(a.id)));
  }

  // A. Check for "Action defined but unreachable"
  const triggeredActions = collectTriggeredActionIds(mutation, currentSpec);
  for (const id of actionIds) {
    // Only check newly added actions for reachability to avoid blocking legacy updates
    const isNew = actions.some((a: any) => normalizeActionId(a.id) === id);
    if (isNew && !triggeredActions.has(id)) {
      throw new Error(`Action ${id} is defined but never triggered by any component, page event, or explicit trigger (state_change/internal).`);
    }
  }

  // B. Check for "Trigger references missing action" (Strict Mode)
  const checkTrigger = (context: string, event: { actionId?: string }) => {
      if (!event.actionId) return;
      const normalized = normalizeActionId(event.actionId);
      if (!actionIds.has(normalized)) {
          throw new Error(`[Strict Mode] ${context} triggers action '${event.actionId}' (normalized: '${normalized}'), but this action is not defined in the intent or existing app.`);
      }
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
    if (a.type === "integration_call") {
      const assignKey = a.config?.assign;
      if (!assignKey && !stateKeysRead.has(`${a.id}.data`)) {
        // Warning instead of Error for Create Mode forgiveness
        console.warn(`[PlannerValidation] Warning: Integration action ${a.id} does not assign result to state (config.assign) nor is its default output (${a.id}.data) read by any component.`);
      }
      if (assignKey) {
        if (!stateKeysRead.has(assignKey)) {
           console.warn(`[PlannerValidation] Warning: Integration action ${a.id} assigns to state key '${assignKey}', but no component reads this key.`);
        }
        // Enforce feedback loop (Relaxed to warning)
        const statusKey = `${assignKey}Status`;
        if (!stateKeysRead.has(statusKey)) {
           console.warn(`[PlannerValidation] Warning: Integration action ${a.id} implies status key '${statusKey}', but no component binds to it (loadingKey). Feedback loop missing.`);
        }
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

export function repairCompiledIntent(intent: CompiledIntent, currentSpec?: ToolSpec) {
  const mutation = intent.tool_mutation as any;
  if (!mutation) return;
  const actions = mutation.actionsAdded ?? [];

  // NORMALIZE ALL ACTION IDs IMMEDIATELY
  for (const a of actions) {
      if (a.id) {
          const oldId = a.id;
          a.id = normalizeActionId(a.id);
          if (oldId !== a.id) {
              console.log(`[PlannerRepair] Normalized action ID: ${oldId} -> ${a.id}`);
          }
      }
  }

  if (!actions.length) return;

  // 1. Identify Target Page (First Page)
  let firstPageId: string | undefined;
  if (Array.isArray(mutation.pagesAdded) && mutation.pagesAdded.length) {
    const p = mutation.pagesAdded[0];
    firstPageId = (p as any).pageId ?? p.id;
  }
  if (!firstPageId && currentSpec && (currentSpec as any).kind === "mini_app") {
    const pages = ((currentSpec as any).pages ?? []);
    firstPageId = pages[0]?.id;
  }

  // 2. Identify Orphans (No trigger at all)
  const allTriggered = collectTriggeredActionIds(mutation, currentSpec);
  const orphanActions = actions.filter((a: any) => !allTriggered.has(a.id));

  for (const action of orphanActions) {
    // A. Check for State Dependencies (Auto-Bind to State Change)
    // E.g. filter-activity depends on {{state.filter}}
    const stateDeps = extractStateDependencies(action);
    if (stateDeps.length > 0) {
      // Bind to the first dependency found.
      // This logic assumes that if state changes, we want to re-run this action.
      action.triggeredBy = { type: "state_change", stateKey: stateDeps[0] };
      console.log(`[PlannerRepair] Auto-bound action ${action.id} -> state_change(${stateDeps[0]})`);
      continue;
    }

    // B. Check for Hydration (Integration Call -> State, no deps)
    // E.g. fetch-initial-data
    if (action.type === "integration_call" && firstPageId) {
        // Explicitly set triggeredBy so it's not orphaned anymore
        action.triggeredBy = { type: "lifecycle", event: "onPageLoad" };
        
        // Also add the runtime event binding
        mutation.pagesUpdated = mutation.pagesUpdated ?? [];
        mutation.pagesUpdated.push({
            pageId: firstPageId,
            patch: {
                events: [
                    { type: "onPageLoad", actionId: action.id, args: { autoAttached: true, reason: "implicit_orphan_hydration" } }
                ]
            }
        });
        console.log(`[PlannerRepair] Auto-bound action ${action.id} -> onPageLoad (hydration)`);
        continue;
    }
    
    // C. Internal Orchestration (Workflow steps, etc)
    // If we can't figure it out, mark as internal orchestration so validation passes?
    // User requirement: "Never fail Create Mode for this".
    // So we default to internal orchestration.
    action.triggeredBy = { type: "internal", reason: "orchestration" };
    console.log(`[PlannerRepair] Auto-bound action ${action.id} -> internal(orchestration)`);
  }

  // 3. Handle Explicit Lifecycle Triggers (triggeredBy: { type: "lifecycle" })
  // These need to be converted to page events because runtime doesn't support triggeredBy natively yet (or fully)
  const lifecycleActions = actions.filter((a: any) => a.triggeredBy?.type === "lifecycle" || a.triggeredBy?.event);
  
  if (lifecycleActions.length && firstPageId) {
    mutation.pagesUpdated = mutation.pagesUpdated ?? [];
    for (const a of lifecycleActions) {
      // Avoid duplicating if we just added it in step 2B
      const eventName = a.triggeredBy?.event === "onAppInit" || a.triggeredBy?.event === "onCreateModeEnter" 
        ? "onPageLoad" 
        : (a.triggeredBy?.event ?? "onPageLoad");
      
      // Check if we already added this event in this mutation pass
      const alreadyAdded = mutation.pagesUpdated.some((u: any) => 
        u.pageId === firstPageId && 
        u.patch?.events?.some((e: any) => e.type === eventName && e.actionId === a.id)
      );

      if (!alreadyAdded) {
        mutation.pagesUpdated.push({
            pageId: firstPageId,
            patch: {
            events: [
                { type: eventName, actionId: a.id, args: { autoAttached: true, reason: "lifecycle_trigger" } }
            ]
            }
        });
      }
    }
  }
}
