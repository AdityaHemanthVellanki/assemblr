import { parseDashboardSpec, type DashboardSpec } from "@/lib/spec/dashboardSpec";

export {
  dashboardSpecSchema,
  parseDashboardSpec,
  type DashboardSpec,
} from "@/lib/spec/dashboardSpec";

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
