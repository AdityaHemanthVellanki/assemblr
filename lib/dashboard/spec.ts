import { z } from "zod";

const metricSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(["count", "sum"]),
    table: z.string().min(1),
    field: z.string().min(1).optional(),
    groupBy: z.enum(["day"]).optional(),
  })
  .strict();

const viewSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(["metric", "line_chart", "bar_chart", "table"]),
    metricId: z.string().min(1).optional(),
    table: z.string().min(1).optional(),
  })
  .strict();

export const dashboardSpecSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    metrics: z.array(metricSchema).min(1),
    views: z.array(viewSchema).min(1),
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

      if (metric.type === "count" && metric.field) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["metrics"],
          message: `Metric "${metric.id}" is type "count" and must not include "field"`,
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

export function createDefaultDashboardSpec({
  title,
}: {
  title?: string;
} = {}): DashboardSpec {
  const metricId = crypto.randomUUID();

  return parseDashboardSpec({
    title: title?.trim().length ? title.trim() : "New Project",
    description: "A starter dashboard spec. This will be generated in Stage 2.",
    metrics: [
      {
        id: metricId,
        label: "Total Users",
        type: "count",
        table: "users",
      },
    ],
    views: [
      { id: crypto.randomUUID(), type: "metric", metricId },
      { id: crypto.randomUUID(), type: "line_chart", metricId },
      { id: crypto.randomUUID(), type: "table", table: "users" },
    ],
  });
}
