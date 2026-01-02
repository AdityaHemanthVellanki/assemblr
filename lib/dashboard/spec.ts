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
  return parseDashboardSpec({
    title: title?.trim().length ? title.trim() : "New Project",
    description: "Empty tool. Describe what you want to build to get started.",
    metrics: [],
    views: [],
  });
}
