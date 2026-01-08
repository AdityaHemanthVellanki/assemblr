
import type { ToolSpec } from "@/lib/spec/toolSpec";

export interface ToolMutation {
    pagesAdded?: (Partial<any> & { pageId?: string; title?: string })[];
    componentsAdded?: (Partial<any> & { pageId?: string; componentId?: string })[];
    actionsAdded?: (Partial<any> & { actionId?: string })[];
    stateAdded?: Record<string, any>;
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
