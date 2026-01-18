
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
      type: "integration_query",
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
