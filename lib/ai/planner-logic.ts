import { CompiledIntent } from "../core/intent";
import type { ToolSpec } from "../spec/toolSpec";
import { normalizeActionId } from "../spec/action-id";

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
    // Validate Action Types
    const allowedActionTypes = new Set(["integration_call", "internal", "navigation", "workflow"]);
    if (!allowedActionTypes.has(a.type)) {
         throw new Error(`Action ${a.id} has invalid type '${a.type}'. Allowed: ${Array.from(allowedActionTypes).join(", ")}`);
    }

    if (a.type === "integration_call") {
      const assignKey = a.config?.assign;
      // Fix 2: Actions Exist but UI Does Not Consume Their State
      const isInternal = a.config?.ephemeral_internal === true;

      // Check if assignKey is consumed by internal actions
      const consumedByInternal = actions.some((other: any) => {
          if (other.id === a.id) return false;
          // Direct input usage
          if (Array.isArray(other.inputs) && other.inputs.includes(assignKey)) return true;
          // State dependency in config (e.g. {{state.githubCommits}})
          const deps = extractStateDependencies(other);
          return deps.includes(assignKey);
      });

      if (!assignKey && !stateKeysRead.has(`${a.id}.data`) && !isInternal) {
        throw new Error(`Integration action ${a.id} does not assign result to state (config.assign) nor is its default output (${a.id}.data) read by any component. Mark as 'ephemeral_internal: true' if this is intentional.`);
      }
      if (assignKey) {
        if (!stateKeysRead.has(assignKey) && !consumedByInternal && !isInternal) {
           throw new Error(`Integration action ${a.id} assigns to state key '${assignKey}', but no component or internal action reads this key.`);
        }
        // Enforce feedback loop
        const statusKey = `${assignKey}Status`;
        const errorKey = `${assignKey}Error`;
        const hasStatus = stateKeysRead.has(statusKey);
        const hasError = stateKeysRead.has(errorKey);
        
        // Internal actions usually don't consume status/error, so we primarily check UI binding here.
        // But if the integration output ITSELF is consumed by internal action (e.g. normalization), 
        // the UI might bind to the NORMALIZED result's status/error, not the raw integration's status/error.
        // However, the user requirement 2 says: "Enforce status & error feedback loops... Bind githubCommitsStatus -> activityStatus"
        // This implies we SHOULD see binding for the raw integration status too? 
        // Or maybe just ONE of the status/error keys should be used if it's an internal pipeline?
        // Let's stick to the requirement: "Ensure both keys exist... And bind them to UI components"
        
        if (!hasStatus && !hasError && !isInternal) {
           // If we have an internal consumer, maybe we can relax this?
           // "Integration pipeline... Normalizer... Filter... UI Binding"
           // If the UI binds to "filteredActivity", it might handle loading state via "filteredActivity" or "activityStatus"?
           // But the raw fetch has "githubCommitsStatus".
           // Requirement says: "Bind githubCommitsStatus -> activityStatus" (via internal action mapping).
           // So we should check if status/error are used EITHER by UI OR by internal action (as input).
           
           const statusConsumed = actions.some((other: any) => {
               if (other.id === a.id) return false;
               if (Array.isArray(other.inputs) && (other.inputs.includes(statusKey) || other.inputs.includes(errorKey))) return true;
               const deps = extractStateDependencies(other);
               return deps.includes(statusKey) || deps.includes(errorKey);
           });

           if (!statusConsumed) {
                throw new Error(`Integration action ${a.id} implies status/error keys ('${statusKey}', '${errorKey}'), but no component or internal action binds to them. Feedback loop missing.`);
           }
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

  // 4. Auto-Wire Feedback Loops (Fix 2) & Select Binding (Fix 4)
  const components = mutation.componentsAdded || [];
  const componentMap = new Map(components.map((c: any) => [c.id, c]));

  // A. Bind Integration Status to Components & Fix Unconsumed Outputs (Part 3 & 5)
  // Re-scan components and actions to check consumption
  const stateKeysRead = new Set<string>();
  const collectReadKeys = (c: any) => {
      if (c.dataSource?.type === "state" && c.dataSource.value) stateKeysRead.add(c.dataSource.value);
      if (c.properties?.bindKey) stateKeysRead.add(c.properties.bindKey);
      if (c.properties?.loadingKey) stateKeysRead.add(c.properties.loadingKey);
      if (c.properties?.errorKey) stateKeysRead.add(c.properties.errorKey);
      if (typeof c.properties?.data === "string") {
           const matches = c.properties.data.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
           if (matches) matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
      }
      if (c.type === "text" && typeof c.properties?.content === "string") {
          const matches = c.properties.content.match(/{{state\.([a-zA-Z0-9_.$-]+)}}/g);
          if (matches) matches.forEach((m: string) => stateKeysRead.add(m.replace("{{state.", "").replace("}}", "")));
      }
  };
  for (const c of components) collectReadKeys(c);
  // Also check existing mini? Ideally yes, but repair runs locally on mutation.
  // We can't easily see existing app structure here if not passed in fully. 
  // Assuming strict mode for new additions primarily.
  
  for (const a of actions) {
      if (a.type === "integration_call" && a.config?.assign) {
          const assignKey = a.config.assign;
          const statusKey = `${assignKey}Status`;
          const errorKey = `${assignKey}Error`;
          
          // 1. Check if Output is Consumed
          // Check UI
          let isConsumed = stateKeysRead.has(assignKey);
          // Check Internal Actions
          if (!isConsumed) {
              isConsumed = actions.some((other: any) => {
                  if (other.id === a.id) return false;
                  if (Array.isArray(other.inputs) && other.inputs.includes(assignKey)) return true;
                  const deps = extractStateDependencies(other);
                  return deps.includes(assignKey);
              });
          }

          if (!isConsumed && a.config?.ephemeral_internal !== true) {
              // Fix 5: Auto-inject normalization action stub
              const normalizeId = `normalize_${a.id.replace(/^fetch_|^get_/, "")}`;
              // Avoid duplicate if it already exists (maybe under different name?)
              const exists = actions.some((x: any) => x.id === normalizeId);
              if (!exists) {
                   const normalizedKey = `${assignKey.replace(/Raw$|Data$/, "")}Items`;
                   const newItem: any = {
                       id: normalizeId,
                       type: "internal",
                       inputs: [assignKey],
                       config: {
                           code: `return ${assignKey}; // Placeholder normalization`,
                           assign: normalizedKey
                       },
                       triggeredBy: { type: "state_change", stateKey: assignKey }
                   };
                   actions.push(newItem);
                   console.log(`[PlannerRepair] Auto-injected normalization action: ${normalizeId} (${assignKey} -> ${normalizedKey})`);
              }
          }

          // Fix: Option A - Bind directly. Do NOT create map_status action.
          // Find the component that consumes the *data* (either assignKey or normalizedKey).
          // If we injected a normalizer, we know the normalizedKey.
          
          let downstreamKey = assignKey;
          // Check if assignKey is input to an internal action that re-assigns
          const consumerAction = actions.find((x: any) => x.type === "internal" && x.inputs?.includes(assignKey));
          if (consumerAction && consumerAction.config?.assign) {
               downstreamKey = consumerAction.config.assign;
          }

          // Scan components binding to downstreamKey (or assignKey)
          for (const c of components) {
              const bindsToData = 
                  c.dataSource?.value === assignKey || 
                  c.dataSource?.value === downstreamKey ||
                  c.properties?.data?.includes(assignKey) ||
                  c.properties?.data?.includes(downstreamKey);
                  
              if (bindsToData) {
                  if (!c.properties) c.properties = {};
                  // Bind to integration status keys directly
                  if (!c.properties.loadingKey) {
                      c.properties.loadingKey = statusKey;
                      console.log(`[PlannerRepair] Auto-wired ${c.id}.loadingKey -> ${statusKey}`);
                  }
                  if (!c.properties.errorKey) {
                      c.properties.errorKey = errorKey;
                      console.log(`[PlannerRepair] Auto-wired ${c.id}.errorKey -> ${errorKey}`);
                  }

                  // If a generic list uses shared keys, mirror GitHub status into shared state via workflow
                  const usesSharedKeys =
                    c.properties.loadingKey === "activityListStatus" ||
                    c.properties.errorKey === "activityListError";
                  if (c.type === "list" && usesSharedKeys) {
                    const mirrorId = `mirror_status_${assignKey.replace(/[^a-zA-Z0-9_]/g, "_")}`;
                    const exists = actions.some((x: any) => x.id === mirrorId);
                    if (!exists) {
                      const mirrorAction: any = {
                        id: mirrorId,
                        type: "workflow",
                        inputs: [statusKey, errorKey],
                        steps: [
                          {
                            type: "state_mutation",
                            config: {
                              updates: {
                                activityListStatus: `{{ ${statusKey} }}`,
                                activityListError: `{{ ${errorKey} }}`,
                              },
                            },
                          },
                        ],
                        triggeredBy: [
                          { type: "state_change", stateKey: statusKey },
                          { type: "state_change", stateKey: errorKey },
                        ],
                      };
                      actions.push(mirrorAction);
                      console.log(`[PlannerRepair] Injected status mirroring action: ${mirrorId} -> activityListStatus/Error`);
                    }
                  }
              }
          }
          // Additional pass: If a generic list uses shared keys, inject mirroring even if it binds filtered data
          for (const c of components) {
              const usesSharedKeys =
                c?.type === "list" &&
                (c?.properties?.loadingKey === "activityListStatus" || c?.properties?.errorKey === "activityListError");
              if (usesSharedKeys) {
                const mirrorId = `mirror_status_${assignKey.replace(/[^a-zA-Z0-9_]/g, "_")}`;
                const exists = actions.some((x: any) => x.id === mirrorId);
                if (!exists) {
                  const mirrorAction: any = {
                    id: mirrorId,
                    type: "workflow",
                    inputs: [statusKey, errorKey],
                    steps: [
                      {
                        type: "state_mutation",
                        config: {
                          updates: {
                            activityListStatus: `{{ ${statusKey} }}`,
                            activityListError: `{{ ${errorKey} }}`,
                          },
                        },
                      },
                    ],
                    triggeredBy: [
                      { type: "state_change", stateKey: statusKey },
                      { type: "state_change", stateKey: errorKey },
                    ],
                  };
                  actions.push(mirrorAction);
                  console.log(`[PlannerRepair] Injected status mirroring action: ${mirrorId} -> activityListStatus/Error`);
                }
              }
          }
      }
  }

  // B. Fix Select Bindings
  for (const c of components) {
      if ((c.type === "select" || c.type === "dropdown") && !c.properties?.bindKey) {
          // Auto-generate bindKey
          const key = `filters.${c.id.replace(/^select_|^dropdown_/, "")}`;
          c.properties = c.properties || {};
          c.properties.bindKey = key;
          
          // Ensure state exists
          mutation.stateAdded = mutation.stateAdded || {};
          if (!mutation.stateAdded[key]) {
              mutation.stateAdded[key] = null; // Initialize
          }
          console.log(`[PlannerRepair] Auto-generated bindKey for ${c.id} -> ${key}`);
      }
  }

  // C. Fix Illegal disabledKey
  for (const c of components) {
      if (c.properties?.disabledKey && c.properties.disabledKey.startsWith("!")) {
          // Try to invert? No, just drop it to be safe and avoid runtime crash
          // Ideally we would create a derived state, but that requires adding a transformation action.
          // For now, dropping the invalid prop allows the app to run (enabled), which is better than crash.
          console.warn(`[PlannerRepair] Dropping invalid disabledKey '${c.properties.disabledKey}' on ${c.id}`);
          delete c.properties.disabledKey;
      }
  }
}
