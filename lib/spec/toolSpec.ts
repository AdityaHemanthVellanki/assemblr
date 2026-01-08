import { dashboardSpecSchema, type DashboardSpec } from "@/lib/spec/dashboardSpec";
import { miniAppSpecSchema, type MiniAppSpec } from "@/lib/spec/miniAppSpec";

export type ToolSpec = DashboardSpec | MiniAppSpec;

export function parseToolSpec(input: unknown): ToolSpec {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const rec = input as Record<string, unknown>;
    if (rec.kind === "mini_app") return miniAppSpecSchema.parse(input);
  }
  return dashboardSpecSchema.parse(input);
}
