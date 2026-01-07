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

export const actionSchema = z.object({
  id: z.string(),
  type: z.enum(["integration_call", "state_mutation", "navigation", "refresh_data"]),
  config: z.record(z.string(), z.any()),
  trigger: z.enum(["manual", "on_load", "interval"]).optional(),
});

export const componentSchema = z.object({
  id: z.string(),
  type: z.enum([
    "table", "metric", "chart", "text", "form", "input", "button", "json", "code", "status", "container"
  ]),
  label: z.string().optional(),
  properties: z.record(z.string(), z.any()).default({}),
  dataSource: z.object({
    type: z.enum(["static", "query", "state", "expression"]),
    value: z.any(),
  }).optional(),
  actions: z.array(z.object({
    trigger: z.string(), // e.g. "onClick", "onSubmit"
    actionId: z.string(),
  })).optional(),
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
  layoutMode: z.enum(["grid", "stack", "canvas"]).default("grid"),
});

export const dashboardSpecSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    // Legacy support (optional now)
    metrics: z.array(metricSchema).default([]),
    views: z.array(viewSchema).default([]),
    // New Tool Architecture
    pages: z.array(pageSchema).default([]),
    actions: z.array(actionSchema).default([]),
    state: z.record(z.string(), z.any()).default({}),
    theme: z.object({
        mode: z.enum(["light", "dark", "system"]).optional(),
        primaryColor: z.string().optional()
    }).optional()
  })
  .strict()
  .superRefine((spec, ctx) => {
    const metricIds = new Set<string>();
    for (const metric of spec.metrics) {
      if (metricIds.has(metric.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metrics"],
          message: `Duplicate metric id: ${metric.id}`,
        });
      }
      metricIds.add(metric.id);

      if (metric.type === "sum" && !metric.field) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metrics"],
          message: `Metric "${metric.id}" is type "sum" and requires "field"`,
        });
      }
    }

    const viewIds = new Set<string>();
    for (const view of spec.views) {
      if (viewIds.has(view.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["views"],
          message: `Duplicate view id: ${view.id}`,
        });
      }
      viewIds.add(view.id);

      if (view.type === "table") {
        if (!view.table) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `View "${view.id}" is type "table" and requires "table"`,
          });
        }
        if (view.metricId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `View "${view.id}" is type "table" and must not include "metricId"`,
          });
        }
        continue;
      }

      if (view.table) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["views"],
          message: `View "${view.id}" is type "${view.type}" and must not include "table"`,
        });
      }

      if (view.type !== "query" && !view.metricId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["views"],
          message: `View "${view.id}" is type "${view.type}" and requires "metricId"`,
        });
        continue;
      }

      if (view.type !== "query" && view.metricId && !metricIds.has(view.metricId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["views"],
          message: `View "${view.id}" references missing metricId "${view.metricId}"`,
        });
      }

      // Query View strict validation
      if (view.type === "query") {
        if (!view.integrationId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `Query view "${view.id}" requires "integrationId"`,
          });
        }
        if (!view.capability) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `Query view "${view.id}" requires "capability"`,
          });
        }
        if (!view.params || typeof view.params !== "object") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `Query view "${view.id}" requires "params"`,
          });
        }
        if (!view.presentation || !view.presentation.kind) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `Query view "${view.id}" requires "presentation.kind"`,
          });
        }
        if ((view as any).metricId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `Query view "${view.id}" must not include "metricId"`,
          });
        }
        if ((view as any).table) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `Query view "${view.id}" must not include "table"`,
          });
        }
        // Disallow query-only keys on non-query views
      } else {
        if ((view as any).capability || (view as any).presentation) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["views"],
            message: `View "${view.id}" must not include "capability" or "presentation" unless type is "query"`,
          });
        }
      }
    }
  });

export type DashboardSpec = z.infer<typeof dashboardSpecSchema>;

export function parseDashboardSpec(input: unknown): DashboardSpec {
  return dashboardSpecSchema.parse(input);
}
