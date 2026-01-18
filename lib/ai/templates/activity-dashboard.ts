
import { MiniAppSpec } from "@/lib/spec/miniAppSpec";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { CompiledIntent } from "@/lib/core/intent";

export const ACTIVITY_DASHBOARD_TEMPLATE: MiniAppSpec = {
  kind: "mini_app",
  title: "Activity Dashboard",
  description: "Unified view of activity across your connected tools",
  state: {
    activities: [],
    activitiesStatus: "idle",
    activitiesError: null,
    filters: {
      tool: "__all__",
      activityType: "__all__",
      timeRange: "7d"
    },
    selectedActivityId: null,
    // Derivations will be populated at runtime, but we declare them here for clarity if needed
    __derivations: {
      filteredActivities: {
        source: "activities",
        op: "filter",
        args: {
          field: "source", // Assuming 'source' is the tool name
          includesKey: "filters.tool"
        }
      },
      selectedActivity: {
        source: "activities",
        op: "find",
        args: {
            field: "id",
            equalsKey: "selectedActivityId"
        }
      },
      hasSelectedActivity: {
        source: "selectedActivity",
        op: "exists"
      },
      hasSelectedActivityWithUrl: {
        source: "selectedActivity",
        op: "exists",
        args: { field: "url" }
      }
    } as any
  },
  pages: [
    {
      id: "main",
      name: "Dashboard",
      layoutMode: "grid",
      events: [
        { type: "onPageLoad", actionId: "fetch_activities" }
      ],
      components: [
        {
          id: "filters_container",
          type: "container",
          layout: { w: 4, h: 1 },
          properties: { layout: "row", gap: 4, variant: "panel" },
          children: [
            {
              id: "tool_filter",
              type: "select",
              label: "Source",
              properties: {
                value: "{{state.filters.tool}}",
                optionValueKey: "value",
                optionLabelKey: "label",
                data: [
                  { label: "All Tools", value: "__all__" },
                  { label: "GitHub", value: "github" },
                  { label: "Slack", value: "slack" },
                  { label: "Linear", value: "linear" },
                  { label: "Notion", value: "notion" },
                  { label: "Google", value: "google" }
                ]
              },
              events: [{ type: "onChange", actionId: "set_tool_filter" }]
            },
            {
              id: "time_filter",
              type: "select",
              label: "Time Range",
              properties: {
                value: "{{state.filters.timeRange}}",
                optionValueKey: "value",
                optionLabelKey: "label",
                data: [
                  { label: "Last 24 Hours", value: "24h" },
                  { label: "Last 7 Days", value: "7d" },
                  { label: "Last 30 Days", value: "30d" }
                ]
              },
              events: [{ type: "onChange", actionId: "set_time_filter" }]
            }
          ]
        },
        {
          id: "activity_list",
          type: "list",
          label: "Recent Activity",
          layout: { w: 2, h: 4 },
          dataSource: {
            type: "derived",
            source: "filteredActivities"
          },
          properties: {
            itemKey: "id",
            itemLabelKey: "title",
            loadingKey: "activitiesStatus",
            errorKey: "activitiesError",
            emptyMessage: "No activity found matching your filters."
          },
          events: [
            { type: "onSelect", actionId: "select_activity", args: { id: "{{item.id}}" } } // item.id needs to be resolved from event payload
          ]
        },
        {
          id: "details_panel",
          type: "container",
          label: "Details",
          layout: { w: 2, h: 4 },
          properties: { variant: "card" },
          children: [
            {
                id: "empty_selection",
                type: "text",
                properties: {
                    content: "Select an activity to view details",
                    visibleIf: { stateKey: "hasSelectedActivity", equals: false }
                }
            },
            {
                id: "selection_container",
                type: "container",
                properties: {
                    layout: "column",
                    visibleIf: { stateKey: "hasSelectedActivity", equals: true }
                },
                children: [
                    {
                      id: "detail_title",
                      type: "text",
                      properties: {
                        content: "{{state.selectedActivity.title}}",
                        variant: "h3"
                      }
                    },
                    {
                      id: "detail_meta",
                      type: "text",
                      properties: {
                        content: "{{state.selectedActivity.source}} • {{state.selectedActivity.timestamp}}"
                      }
                    },
                    {
                      id: "detail_desc",
                      type: "text",
                      properties: {
                        content: "{{state.selectedActivity.description}}"
                      }
                    },
                    {
                      id: "open_btn",
                      type: "button",
                      label: "Open in Tool",
                      properties: {
                        // Declarative visibility
                        visibleIf: { stateKey: "hasSelectedActivityWithUrl", equals: true }
                      },
                      events: [
                        { type: "onClick", actionId: "open_in_tool" }
                      ]
                    }
                ]
            }
          ]
        }
      ]
    }
  ],
  actions: [
    {
      id: "fetch_activities",
      type: "integration_call",
      triggeredBy: { type: "lifecycle", event: "onPageLoad" },
      config: {
        capabilityId: "activity_feed_list", // Canonical capability (virtual)
        assign: "activities",
        args: {
            limit: 50
        }
      }
    },
    {
      id: "select_activity",
      type: "internal",
      triggeredBy: { type: "component_event", componentId: "activity_list", event: "onSelect" },
      config: {
        updates: {
          selectedActivityId: "{{payload.id}}"
        }
      }
    },
    {
      id: "open_in_tool",
      type: "navigation",
      triggeredBy: { type: "component_event", componentId: "open_btn", event: "onClick" },
      config: {
        url: "{{state.selectedActivity.url}}",
        target: "_blank"
      }
    },
    // Filter actions are implicit via bindKey?
    // User said: "Internal Actions: set_tool_filter, set_activity_type_filter..."
    // But also: "A Select component MUST use exactly one of: bindKey (controlled) OR stateUpdate."
    // If we use bindKey, we don't need explicit actions for setting state, the runtime handles it.
    // However, the user listed "set_tool_filter" as an Internal Action in the prompt.
    // If I use bindKey, the runtime does `setState({ [bindKey]: val })` automatically.
    // Does that count as an action? In `runtime.tsx`, `TextInputComponent` and `DropdownComponent` do:
    // `if (bindKey) setState({ [bindKey]: next }); emit("onChange", ...)`
    // If I want to be strict and explicit, I should maybe use `stateUpdate` event instead of `bindKey`?
    // But `bindKey` is the "controlled" mode.
    // The user said: "A Select component MUST use exactly one of: bindKey (controlled) OR stateUpdate."
    // If I use bindKey, I don't need an action.
    // BUT the user listed `set_tool_filter` in "Internal Actions".
    // Maybe the user wants me to use `stateUpdate` via an action?
    // Or maybe the user implies that `bindKey` IS the action mechanism?
    // Let's stick to `bindKey` as it's cleaner for form inputs, and it's "Canonical".
    // I will NOT add explicit `set_tool_filter` actions if `bindKey` covers it, 
    // UNLESS the user explicitly wants them in the execution graph.
    // "All actions must appear in the execution graph".
    // `bindKey` updates state directly in runtime, it doesn't go through `dispatch` (except for `emit("onChange")`).
    // If I want it in the graph, I should use `onChange` -> `set_tool_filter`.
    // Let's use `bindKey` for simplicity and standard form behavior, but if strictness requires actions, I'll switch.
    // User said: "Internal Actions ... set_tool_filter ... All actions MUST appear in the execution graph".
    // This suggests I should use the Action Registry for these updates.
    // So: Select component -> NO bindKey -> `onChange` event -> `set_tool_filter` action -> updates state.
    // Wait, "Select component MUST use exactly one of: bindKey... OR stateUpdate".
    // If I use `stateUpdate` (which is an inline definition?), wait.
    // "UI components MUST NOT declare inline actions".
    // So I must use `actionId`.
    // So: Select component -> `onChange` -> actionId: `set_tool_filter`.
    // `set_tool_filter` -> type: `internal`, config: { updates: { "filters.tool": "{{payload.value}}" } }
    // AND `properties: { value: "{{state.filters.tool}}" }` (Controlled via prop, not bindKey).
    // This satisfies "All actions must appear in the execution graph".
    
    {
      id: "set_tool_filter",
      type: "internal",
      triggeredBy: { type: "component_event", componentId: "tool_filter", event: "onChange" },
      config: {
        updates: {
          "filters.tool": "{{payload.value}}"
        }
      }
    },
    {
      id: "set_time_filter",
      type: "internal",
      triggeredBy: { type: "component_event", componentId: "time_filter", event: "onChange" },
      config: {
        updates: {
          "filters.timeRange": "{{payload.value}}"
        }
      }
    }
  ]
};

export function getActivityDashboardSpec(): CompiledIntent {
  // We wrap the MiniAppSpec in a CompiledIntent
  const spec = JSON.parse(JSON.stringify(ACTIVITY_DASHBOARD_TEMPLATE));
  
  // Adjust components to use value + onChange (Action) instead of bindKey
  // to satisfy "All actions must appear in execution graph" if that's the strict requirement.
  // Actually, let's look at the template I wrote above.
  // I used bindKey in the component definition.
  // I should change it to use value + action.
  
  const filters = spec.pages[0].components.find((c: any) => c.id === "filters_container");
  if (filters && filters.children) {
    const toolFilter = filters.children.find((c: any) => c.id === "tool_filter");
    if (toolFilter) {
      delete toolFilter.properties.bindKey;
      toolFilter.properties.value = "{{state.filters.tool}}";
      toolFilter.events = [{ type: "onChange", actionId: "set_tool_filter" }];
    }
    
    const timeFilter = filters.children.find((c: any) => c.id === "time_filter");
    if (timeFilter) {
      delete timeFilter.properties.bindKey;
      timeFilter.properties.value = "{{state.filters.timeRange}}";
      timeFilter.events = [{ type: "onChange", actionId: "set_time_filter" }];
    }
  }

  return {
    intent_type: "create",
    system_goal: "View activity dashboard",
    constraints: [],
    integrations_required: [], // We don't strictly require them, we degrade gracefully
    output_mode: "mini_app",
    tool_mutation: {
        toolPropsUpdated: {
            title: spec.title,
            description: spec.description
        },
        pagesAdded: spec.pages,
        actionsAdded: spec.actions,
        stateAdded: spec.state,
        componentsAdded: [] // We put components in pagesAdded
    },
    execution_graph: { nodes: [], edges: [] }, // Will be populated by buildExecutionGraph
    execution_policy: {
      deterministic: true,
      parallelizable: false,
      retries: 0
    }
  };
}
