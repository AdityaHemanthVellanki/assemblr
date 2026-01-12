
import type { ToolSpec } from "@/lib/spec/toolSpec";

export interface ToolMutation {
    pagesAdded?: (Partial<any> & { pageId?: string; title?: string })[];
    componentsAdded?: (Partial<any> & { pageId?: string; componentId?: string })[];
    actionsAdded?: (Partial<any> & { actionId?: string })[];
    stateAdded?: Record<string, any>;
    componentsUpdated?: Array<{ id?: string; componentRef?: string; pageId?: string; patch: Partial<any> }>;
    componentsRemoved?: Array<{ id?: string; componentRef?: string; pageId?: string }>;
    reparent?: Array<{ id?: string; componentRef?: string; fromPageId?: string; toPageId: string; toParentId?: string; position?: number }>;
    containerPropsUpdated?: Array<{ id?: string; componentRef?: string; pageId?: string; propertiesPatch: Record<string, any> }>;
}

export function materializeSpec(baseSpec: ToolSpec, mutation: ToolMutation): ToolSpec {
    const spec: any = JSON.parse(JSON.stringify(baseSpec ?? {}));
    if (!spec.pages) spec.pages = [];
    if (!spec.actions) spec.actions = [];
    if (!spec.state) spec.state = {};

    return materializeMiniApp(spec, mutation) as ToolSpec;
}

function materializeMiniApp(spec: any, mutation: ToolMutation): any {
    if (!mutation) return spec;

    if (!spec.pages) spec.pages = [];
    if (!spec.actions) spec.actions = [];
    if (!spec.state) spec.state = {};

    if (mutation.pagesAdded) {
        for (const rawPage of mutation.pagesAdded) {
            const canonicalId = (rawPage as any).pageId ?? rawPage.id ?? `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            const name = (rawPage as any).name ?? (rawPage as any).title ?? "Untitled Page";
            const page: any = {
                id: canonicalId,
                name,
                path: rawPage.path,
                components: [],
                state: rawPage.state || {},
                layoutMode: rawPage.layoutMode || "grid",
                events: rawPage.events || []
            };
            const existingIndex = spec.pages.findIndex((p: any) => p.id === page.id);
            if (existingIndex >= 0) {
                spec.pages[existingIndex] = {
                    ...spec.pages[existingIndex],
                    ...page,
                    components: spec.pages[existingIndex].components
                };
            } else {
                spec.pages.push(page);
            }
        }
    }

    if (spec.pages.length === 0) {
        throw new Error("Mini app has no pages. This is a fatal authoring error.");
    }

    if (mutation.stateAdded) {
        const resolvedState: Record<string, any> = {};
        for (const [key, value] of Object.entries(mutation.stateAdded)) {
            resolvedState[key] = resolveTemplates(value);
        }
        spec.state = {
            ...spec.state,
            ...resolvedState
        };
    }

    if (mutation.componentsAdded) {
        for (const rawComp of mutation.componentsAdded) {
            const { pageId, componentId, ...compData } = rawComp as any;
            let targetPage: any | undefined;
            if (pageId) {
                targetPage = spec.pages.find((p: any) => p.id === pageId);
                if (!targetPage) {
                    const available = spec.pages.map((p: any) => p.id).join(", ") || "(none)";
                    throw new Error(
                        `MiniApp materialization error: page '${pageId}' not found. Available pages: ${available}`
                    );
                }
            }
            if (!targetPage) {
                targetPage = spec.pages[0];
            }

            const canonicalId =
                componentId ??
                compData.id ??
                `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

            const component: any = {
                id: canonicalId,
                type: (compData.type as any) || "text",
                label: compData.label,
                properties: compData.properties || {},
                dataSource: compData.dataSource,
                events: compData.events,
                renderIf: compData.renderIf,
                children: compData.children,
                layout: compData.layout
            };

            targetPage.components.push(component);
        }
    }

    if (mutation.componentsUpdated && mutation.componentsUpdated.length) {
        for (const upd of mutation.componentsUpdated) {
            const target = findComponent(spec, upd.pageId, upd.id, upd.componentRef);
            if (!target) {
                throw new Error(`Update failed: component not found (${upd.id || upd.componentRef})`);
            }
            const { component } = target;
            const patch = (upd.patch || {}) as any;
            if (patch.type && patch.type !== component.type) {
                throw new Error(`Update failed: type change from ${component.type} to ${patch.type} is not allowed in componentsUpdated`);
            }
            if (patch.label !== undefined) component.label = patch.label;
            if (patch.properties) component.properties = { ...(component.properties || {}), ...(patch.properties || {}) };
            if (patch.dataSource !== undefined) component.dataSource = patch.dataSource;
            if (patch.events !== undefined) component.events = patch.events;
            if (patch.layout !== undefined) component.layout = { ...(component.layout || {}), ...(patch.layout || {}) };
        }
    }

    if (mutation.componentsRemoved && mutation.componentsRemoved.length) {
        for (const rem of mutation.componentsRemoved) {
            const target = findComponent(spec, rem.pageId, rem.id, rem.componentRef);
            if (!target) {
                throw new Error(`Remove failed: component not found (${rem.id || rem.componentRef})`);
            }
            const { page, parent, index } = target;
            if (parent) {
                parent.children.splice(index, 1);
            } else {
                page.components.splice(index, 1);
            }
        }
    }

    if (mutation.reparent && mutation.reparent.length) {
        for (const move of mutation.reparent) {
            const source = findComponent(spec, move.fromPageId || undefined, move.id, move.componentRef);
            if (!source) {
                throw new Error(`Reparent failed: source component not found (${move.id || move.componentRef})`);
            }
            const { page: fromPage, parent: fromParent, index: fromIndex, component } = source;

            if (fromParent) {
                fromParent.children.splice(fromIndex, 1);
            } else {
                fromPage.components.splice(fromIndex, 1);
            }

            const toPage = spec.pages.find((p: any) => p.id === move.toPageId);
            if (!toPage) {
                throw new Error(`Reparent failed: destination page not found (${move.toPageId})`);
            }
            if (move.toParentId) {
                const toParentTarget = findComponent(spec, move.toPageId, move.toParentId, undefined);
                if (!toParentTarget) {
                    throw new Error(`Reparent failed: destination parent not found (${move.toParentId})`);
                }
                const toParent = toParentTarget.component;
                if (!Array.isArray(toParent.children)) toParent.children = [];
                const pos = Number.isFinite(move.position as any) ? Number(move.position) : toParent.children.length;
                toParent.children.splice(Math.max(0, Math.min(pos, toParent.children.length)), 0, component);
            } else {
                const pos = Number.isFinite(move.position as any) ? Number(move.position) : toPage.components.length;
                toPage.components.splice(Math.max(0, Math.min(pos, toPage.components.length)), 0, component);
            }
        }
    }

    if (mutation.containerPropsUpdated && mutation.containerPropsUpdated.length) {
        for (const upd of mutation.containerPropsUpdated) {
            const target = findComponent(spec, upd.pageId, upd.id, upd.componentRef);
            if (!target) {
                throw new Error(`Container update failed: component not found (${upd.id || upd.componentRef})`);
            }
            const { component } = target;
            if (String(component.type).toLowerCase() !== "container") {
                throw new Error(`Container update failed: target is not a container (type=${component.type})`);
            }
            component.properties = { ...(component.properties || {}), ...(upd.propertiesPatch || {}) };
        }
    }

    if (mutation.actionsAdded) {
        for (const rawAction of mutation.actionsAdded) {
            const { actionId, id, ...rest } = rawAction as any;
            const canonicalId =
                actionId ??
                id ??
                `action_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

            const action: any = {
                id: canonicalId,
                type: (rest as any).type,
                config: (rest as any).config,
                steps: (rest as any).steps
            };

            const exists = spec.actions.some((a: any) => a.id === action.id);
            if (!exists) {
                spec.actions.push(action);
            }
        }
    }

    validateSpec(spec);

    return spec;
}

type FindResult = { page: any; parent: any | null; index: number; component: any } | null;

function findComponent(spec: any, pageId: string | undefined, id?: string, componentRef?: string): FindResult {
    const pid = pageId || undefined;
    const pages = spec.pages || [];
    const visitPages = pid ? pages.filter((p: any) => p.id === pid) : pages;
    const targetId = id;

    for (const page of visitPages) {
        // Search root components
        const idx = page.components.findIndex((c: any) => (targetId ? c.id === targetId : false) || matchesRef(c, componentRef));
        if (idx >= 0) return { page, parent: null, index: idx, component: page.components[idx] };

        // Deep search
        const res = deepFind(page, page.components, targetId, componentRef);
        if (res) return { page, ...res };
    }
    return null;
}

function deepFind(page: any, nodes: any[], id?: string, ref?: string): { parent: any; index: number; component: any } | null {
    for (const node of nodes) {
        if (Array.isArray(node.children) && node.children.length) {
            const idx = node.children.findIndex((c: any) => (id ? c.id === id : false) || matchesRef(c, ref));
            if (idx >= 0) return { parent: node, index: idx, component: node.children[idx] };
            const nested = deepFind(page, node.children, id, ref);
            if (nested) return nested;
        }
    }
    return null;
}

function matchesRef(component: any, ref?: string): boolean {
    if (!ref) return false;
    const r = String(ref).toLowerCase();
    const label = (component.label ? String(component.label) : "").toLowerCase();
    const type = String(component.type || "").toLowerCase();
    const title = (component.properties?.title ? String(component.properties.title) : "").toLowerCase();
    const bindKey = (component.properties?.bindKey ? String(component.properties.bindKey) : "").toLowerCase();
    const dsVal = (component.dataSource?.value ? String(component.dataSource.value) : "").toLowerCase();
    const candidates = [label, type, title, bindKey, dsVal].filter(Boolean);
    return candidates.some((c) => c && r.includes(c));
}

function resolveTemplates(value: any): any {
    if (typeof value !== "string") return value;
    
    // Dynamic Date Templates
    const today = new Date();
    
    if (value === "{{date_today}}") {
        return today.toISOString().split("T")[0];
    }
    
    // {{date_N_months_ago}}
    const monthsMatch = value.match(/^{{date_(\d+)_months_ago}}$/);
    if (monthsMatch) {
        const months = parseInt(monthsMatch[1]);
        const d = new Date(today);
        d.setMonth(d.getMonth() - months);
        return d.toISOString().split("T")[0];
    }

    // {{date_N_days_ago}}
    const daysMatch = value.match(/^{{date_(\d+)_days_ago}}$/);
    if (daysMatch) {
        const days = parseInt(daysMatch[1]);
        const d = new Date(today);
        d.setDate(d.getDate() - days);
        return d.toISOString().split("T")[0];
    }

    return value;
}

function validateSpec(spec: any) {
    // 1. Check for duplicate Component IDs across all pages
    const componentIds = new Set<string>();
    for (const page of spec.pages) {
        for (const comp of page.components) {
            if (componentIds.has(comp.id)) {
                // Warn or throw? User said "Fail early if Duplicate IDs exist"
                // However, crashing the generation might be harsh. 
                // We'll throw to be strict as requested ("Spec correctness problem").
                throw new Error(`Duplicate Component ID found: ${comp.id}`);
            }
            componentIds.add(comp.id);
        }
    }

    // 2. Check Action references (if actions reference components, which they don't directly in schema, 
    // but events reference actions)
    // Validate Events reference existing Actions
    const actionIds = new Set(spec.actions.map((a: any) => a.id));
    for (const page of spec.pages) {
        for (const comp of page.components) {
            if (comp.events) {
                for (const event of comp.events) {
                    if (!actionIds.has(event.actionId)) {
                        console.warn(`Component ${comp.id} references missing action: ${event.actionId}`);
                        // throw new Error(`Missing Action: ${event.actionId}`); // Strictness?
                    }
                }
            }
        }
    }
}
