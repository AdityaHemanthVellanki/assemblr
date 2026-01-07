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
    type: z.enum(["metric", "line_chart", "bar_chart", "table", "heatmap"]),
    metricId: z.string().min(1).optional(),
    table: z.string().min(1).optional(),
    integrationId: z.string().optional(),
    params: z.record(z.string(), z.any()).optional(),
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

export const dashboardSpecSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    metrics: z.array(metricSchema).default([]),
    views: z.array(viewSchema).default([]),
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

      if (!view.metricId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["views"],
          message: `View "${view.id}" is type "${view.type}" and requires "metricId"`,
        });
        continue;
      }

      if (!metricIds.has(view.metricId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["views"],
          message: `View "${view.id}" references missing metricId "${view.metricId}"`,
        });
      }
    }
  });

export type DashboardSpec = z.infer<typeof dashboardSpecSchema>;

export function parseDashboardSpec(input: unknown): DashboardSpec {
  return dashboardSpecSchema.parse(input);
}
