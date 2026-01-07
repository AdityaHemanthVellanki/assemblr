
import { z } from "zod";
import { 
    DashboardSpec, 
    pageSchema, 
    componentSchema, 
    actionSchema, 
    dashboardSpecSchema 
} from "./dashboardSpec";

// Infer types locally since they aren't exported
type Page = z.infer<typeof pageSchema>;
type Component = z.infer<typeof componentSchema>;
type Action = z.infer<typeof actionSchema>;

export interface ToolMutation {
    pagesAdded?: Partial<Page>[];
    // Components might come with an extra 'pageId' from the planner to indicate placement
    componentsAdded?: (Partial<Component> & { pageId?: string })[];
    actionsAdded?: Action[];
    stateAdded?: Record<string, any>;
}

export function materializeSpec(baseSpec: DashboardSpec, mutation: ToolMutation): DashboardSpec {
    // 1. Deep Clone Base Spec to avoid mutations
    const spec: DashboardSpec = JSON.parse(JSON.stringify(baseSpec));
    
    // Ensure arrays exist
    if (!spec.pages) spec.pages = [];
    if (!spec.actions) spec.actions = [];
    if (!spec.state) spec.state = {};

    // 2. Process Pages
    // Initialize pages with empty components array if missing
    if (mutation.pagesAdded) {
        for (const rawPage of mutation.pagesAdded) {
            const page: Page = {
                id: rawPage.id || `page_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                name: rawPage.name || "Untitled Page",
                path: rawPage.path,
                components: [], // FORCE INITIALIZATION
                state: rawPage.state || {},
                layoutMode: rawPage.layoutMode || "grid",
                events: rawPage.events || []
            };
            
            // Check for duplicates
            const existingIndex = spec.pages.findIndex(p => p.id === page.id);
            if (existingIndex >= 0) {
                // Merge or Skip? Usually overwrite or merge. Let's overwrite for now or keep existing components?
                // User said "pagesAdded", implying new pages.
                // If ID collision, we might assume it's an update, but "Added" implies new.
                // For safety, if it exists, we keep the existing one and warn, or update properties.
                // Let's assume unique IDs for now or overwrite metadata but keep components.
                spec.pages[existingIndex] = {
                    ...spec.pages[existingIndex],
                    ...page,
                    components: spec.pages[existingIndex].components // Preserve existing components
                };
            } else {
                spec.pages.push(page);
            }
        }
    }

    // 3. Process Components
    if (mutation.componentsAdded) {
        for (const rawComp of mutation.componentsAdded) {
            const { pageId, ...compData } = rawComp;
            
            // Default to first page if no pageId provided
            let targetPage: Page | undefined;
            
            if (pageId) {
                targetPage = spec.pages.find(p => p.id === pageId);
                if (!targetPage) {
                    throw new Error(`Component ${compData.id || "unknown"} references missing pageId: ${pageId}`);
                }
            }
            
            if (!targetPage) {
                if (spec.pages.length === 0) {
                    // Auto-create Home Page if absolutely no pages exist
                    const homePage: Page = {
                        id: "page_home",
                        name: "Home",
                        components: [],
                        state: {},
                        layoutMode: "grid"
                    };
                    spec.pages.push(homePage);
                    targetPage = homePage;
                } else {
                    // Fallback to first page
                    targetPage = spec.pages[0];
                }
            }

            // Construct full component
            // We need to cast because partials might miss required fields, but we assume planner is good enough
            // or we fill defaults.
            const component: Component = {
                id: compData.id || `comp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                type: (compData.type as any) || "text",
                label: compData.label,
                properties: compData.properties || {},
                dataSource: compData.dataSource,
                events: compData.events,
                renderIf: compData.renderIf,
                layout: compData.layout
            };

            targetPage.components.push(component);
        }
    }

    // 4. Process Actions
    if (mutation.actionsAdded) {
        for (const action of mutation.actionsAdded) {
            // Check duplicate
            const exists = spec.actions.some(a => a.id === action.id);
            if (!exists) {
                spec.actions.push(action);
            }
        }
    }

    // 5. Process State
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

    // 6. Validation Phase
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

function validateSpec(spec: DashboardSpec) {
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
    const actionIds = new Set(spec.actions.map(a => a.id));
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
