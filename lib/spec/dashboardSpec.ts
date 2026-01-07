import { z } from "zod";

const metricSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    // Existing inline definition
    type: z.enum(["count", "sum"]).optional(),
    table: z.string().min(1).optional(),
    field: z.string().min(1).optional(),
    groupBy: z.enum(["day"]).optional(),
    integrationId: z.string().optional(),
    
    // New Metric Registry Reference
    metricRef: z.object({
      id: z.string(),
      version: z.number().optional(),
    }).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    // Either inline definition or metricRef must be present
    const hasInline = !!(data.type && data.table);
    const hasRef = !!data.metricRef;

    if (!hasInline && !hasRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["metricRef"],
        message: "Metric must provide either inline definition (type, table) or metricRef",
      });
    }
  });

const viewSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["metric", "line_chart", "bar_chart", "table", "heatmap", "query"]),
    metricId: z.string().min(1).optional(),
    table: z.string().min(1).optional(),
    integrationId: z.string().optional(),
    params: z.record(z.string(), z.any()).optional(),
    capability: z.string().optional(),
    presentation: z
      .object({
        kind: z.enum(["list", "card", "timeline"]),
        fields: z.array(z.string()).optional(),
      })
      .optional(),
    query: z.object({
        filters: z.record(z.string(), z.any()).optional(),
        sort: z.object({
            field: z.string(),
            direction: z.enum(["asc", "desc"])
        }).optional(),
        limit: z.number().optional(),
        groupBy: z.array(z.string()).optional()
    }).optional(),
  })
  .strict();

export const eventSchema = z.object({
  type: z.enum(["onClick", "onChange", "onSubmit", "onLoad", "onRefresh"]),
  actionId: z.string(),
  args: z.record(z.string(), z.any()).optional(),
});

export const conditionSchema = z.object({
  field: z.string(), // e.g. "state.loading"
  operator: z.enum(["eq", "neq", "gt", "lt", "contains"]),
  value: z.any(),
});

export const actionSchema = z.object({
  id: z.string(),
  type: z.enum(["integration_call", "state_mutation", "navigation", "refresh_data", "workflow"]),
  config: z.object({
    integrationId: z.string().optional(),
    capability: z.string().optional(),
    params: z.record(z.string(), z.any()).optional(), // Can use {{state.var}}
    updates: z.record(z.string(), z.any()).optional(), // For state_mutation
    pageId: z.string().optional(), // For navigation
    steps: z.array(z.string()).optional(), // For workflow (action IDs)
  }),
  inputs: z.record(z.string(), z.string()).optional(), // Map args to internal params
});

export const componentSchema = z.object({
  id: z.string(),
  type: z.enum([
    "table", "metric", "chart", "text", "form", "input", "select", "button", "json", "code", "status", "container", "modal"
  ]),
  label: z.string().optional(),
  properties: z.record(z.string(), z.any()).default({}), // placeholder, defaultValue, options, content
  dataSource: z.object({
    type: z.enum(["static", "query", "state", "expression"]),
    value: z.any(),
  }).optional(),
  events: z.array(eventSchema).optional(),
  renderIf: conditionSchema.optional(),
  layout: z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    w: z.number().optional(),
    h: z.number().optional(),
  }).optional(),
});

export const pageSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string().optional(),
  components: z.array(componentSchema).default([]),
  state: z.record(z.string(), z.any()).default({}), // Page-level state
  events: z.array(eventSchema).optional(), // Page load events
  layoutMode: z.enum(["grid", "stack", "canvas"]).default("grid"),
});

export const toolSpecSchema = z
  .object({
    kind: z.enum(["dashboard", "mini_app"]).default("dashboard"),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    // Legacy support (optional now)
    metrics: z.array(metricSchema).default([]),
    views: z.array(viewSchema).default([]),
    // New Tool Architecture
    pages: z.array(pageSchema).default([]),
    actions: z.array(actionSchema).default([]),
    state: z.record(z.string(), z.any()).default({}), // Global state
    theme: z.object({
        mode: z.enum(["light", "dark", "system"]).optional(),
        primaryColor: z.string().optional()
    }).optional()
  })
  .strict();

export const dashboardSpecSchema = toolSpecSchema;

export type ToolSpec = z.infer<typeof toolSpecSchema>;
export type DashboardSpec = ToolSpec; // Alias for backward compat

export function parseDashboardSpec(input: unknown): ToolSpec {
  return toolSpecSchema.parse(input);
}
