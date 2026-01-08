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

export const DashboardKind = z.literal("dashboard");
export type DashboardKind = z.infer<typeof DashboardKind>;

export const dashboardSpecSchema = z
  .object({
    kind: DashboardKind.default("dashboard"),
    title: z.string().min(1),
    description: z.string().min(1).optional(),
    metrics: z.array(metricSchema).default([]),
    views: z.array(viewSchema).default([]),
    theme: z
      .object({
        mode: z.enum(["light", "dark", "system"]).optional(),
        primaryColor: z.string().optional(),
      })
      .optional(),
  })
  .strict();

export type DashboardSpec = z.infer<typeof dashboardSpecSchema>;

export function parseDashboardSpec(input: unknown): DashboardSpec {
  return dashboardSpecSchema.parse(input);
}
