import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSpec } from "@/lib/dashboard/spec";

type Metric = DashboardSpec["metrics"][number];
type View = DashboardSpec["views"][number];

function hashToInt(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function mockMetricValue(metric: Metric) {
  const base = hashToInt(`${metric.id}:${metric.table}:${metric.field ?? ""}`);
  const value = (base % 9000) + 100;
  return value;
}

function mockSeries(metric: Metric) {
  const base = hashToInt(`${metric.id}:${metric.type}`);
  const points = Array.from({ length: 7 }).map((_, idx) => {
    const value = ((base + idx * 997) % 80) + 10;
    return { label: `Day ${idx + 1}`, value };
  });
  return points;
}

function mockTableRows(table: string) {
  const base = hashToInt(table);
  return Array.from({ length: 5 }).map((_, idx) => {
    const n = ((base + idx * 13) % 900) + 100;
    return {
      id: `row_${idx + 1}`,
      name: `${table}_item_${idx + 1}`,
      value: n,
    };
  });
}

function MetricCard({ metric }: { metric: Metric }) {
  const value = mockMetricValue(metric);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {metric.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function LineChartCard({ metric }: { metric: Metric }) {
  const series = mockSeries(metric);
  const max = Math.max(...series.map((p) => p.value), 1);

  const width = 640;
  const height = 160;
  const padding = 12;

  const points = series
    .map((p, idx) => {
      const x =
        padding +
        (idx * (width - padding * 2)) / Math.max(series.length - 1, 1);
      const y =
        height -
        padding -
        (p.value * (height - padding * 2)) / Math.max(max, 1);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-40 w-full rounded-md border border-border bg-background"
          role="img"
          aria-label={`${metric.label} trend`}
        >
          <polyline
            points={points}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((p) => (
            <div key={p.label} className="tabular-nums">
              {p.label}: {p.value}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartCard({ metric }: { metric: Metric }) {
  const series = mockSeries(metric);
  const max = Math.max(...series.map((p) => p.value), 1);

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-2 rounded-md border border-border bg-background p-3">
          {series.map((p) => (
            <div key={p.label} className="flex flex-1 flex-col gap-2">
              <div
                className="w-full rounded-sm bg-primary/80"
                style={{ height: `${(p.value / max) * 100}%` }}
                aria-label={`${p.label}: ${p.value}`}
              />
              <div className="text-center text-[10px] text-muted-foreground">
                {p.label.replace("Day ", "D")}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TableCard({ table }: { table: string }) {
  const rows = mockTableRows(table);
  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Table: {table}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-accent text-accent-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function renderView(view: View, metricsById: Map<string, Metric>) {
  if (view.type === "table") {
    return <TableCard key={view.id} table={view.table!} />;
  }

  const metric = metricsById.get(view.metricId!);
  if (!metric) {
    throw new Error(`Spec references missing metricId "${view.metricId}"`);
  }

  if (view.type === "metric")
    return <MetricCard key={view.id} metric={metric} />;
  if (view.type === "line_chart")
    return <LineChartCard key={view.id} metric={metric} />;
  if (view.type === "bar_chart")
    return <BarChartCard key={view.id} metric={metric} />;

  throw new Error(`Unknown view type: ${(view as { type: string }).type}`);
}

export function renderDashboard(spec: DashboardSpec) {
  const metricsById = new Map(spec.metrics.map((m) => [m.id, m]));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight">
          {spec.title}
        </div>
        {spec.description ? (
          <div className="text-sm text-muted-foreground">
            {spec.description}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {spec.views.map((view) => renderView(view, metricsById))}
      </div>
    </div>
  );
}
