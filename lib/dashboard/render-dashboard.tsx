import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSpec } from "@/lib/dashboard/spec";

type Metric = DashboardSpec["metrics"][number];
type View = DashboardSpec["views"][number];

export type DashboardQueryResult =
  | { kind: "metric"; value: number }
  | { kind: "series"; points: Array<{ label: string; value: number }> }
  | {
      kind: "table";
      columns: string[];
      rows: Array<Record<string, unknown>>;
    };

export type DashboardViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; result: DashboardQueryResult };

function LoadingCard({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">Loading…</div>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-sm">{message}</div>
      </CardContent>
    </Card>
  );
}

function MetricCard({ metric, value }: { metric: Metric; value: number }) {
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

function LineChartCard({
  metric,
  points,
}: {
  metric: Metric;
  points: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);

  const width = 640;
  const height = 160;
  const padding = 12;

  const polylinePoints = points
    .map((p, idx) => {
      const x =
        padding +
        (idx * (width - padding * 2)) / Math.max(points.length - 1, 1);
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
        <CardTitle className="text-sm font-medium">
          Trend: {metric.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-40 w-full rounded-md border border-border bg-background"
          role="img"
          aria-label={`${metric.label} trend`}
        >
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {points.slice(-14).map((p) => (
            <div key={p.label} className="tabular-nums">
              {p.label}: {p.value}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartCard({
  metric,
  points,
}: {
  metric: Metric;
  points: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Breakdown: {metric.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-40 items-end gap-2 rounded-md border border-border bg-background p-3">
          {points.slice(0, 14).map((p) => (
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

function TableCard({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <Card className="col-span-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-accent text-accent-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-3 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className="border-t border-border">
                  <td
                    className="px-3 py-3 text-sm text-muted-foreground"
                    colSpan={Math.max(columns.length, 1)}
                  >
                    No rows
                  </td>
                </tr>
              ) : (
                rows.slice(0, 50).map((r, idx) => (
                  <tr key={idx} className="border-t border-border">
                    {columns.map((c) => (
                      <td key={c} className="px-3 py-2">
                        {String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function renderView(
  view: View,
  metricsById: Map<string, Metric>,
  stateByViewId?: Record<string, DashboardViewState>,
) {
  const state = stateByViewId?.[view.id];
  const title =
    view.type === "table"
      ? `Table: ${view.table ?? ""}`
      : `${view.type}: ${metricsById.get(view.metricId ?? "")?.label ?? ""}`;

  if (!state) return <LoadingCard key={view.id} title={title} />;
  if (state.status === "loading")
    return <LoadingCard key={view.id} title={title} />;
  if (state.status === "error")
    return <ErrorCard key={view.id} title={title} message={state.message} />;

  if (view.type === "table") {
    if (state.result.kind !== "table") {
      return (
        <ErrorCard
          key={view.id}
          title={title}
          message="Invalid table result"
        />
      );
    }
    return (
      <TableCard
        key={view.id}
        title={title}
        columns={state.result.columns}
        rows={state.result.rows}
      />
    );
  }

  const metric = metricsById.get(view.metricId!);
  if (!metric) {
    return (
      <ErrorCard
        key={view.id}
        title={title}
        message="View references missing metric"
      />
    );
  }

  if (view.type === "metric") {
    if (state.result.kind !== "metric") {
      return (
        <ErrorCard
          key={view.id}
          title={title}
          message="Invalid metric result"
        />
      );
    }
    return <MetricCard key={view.id} metric={metric} value={state.result.value} />;
  }

  if (view.type === "line_chart") {
    if (state.result.kind !== "series") {
      return (
        <ErrorCard
          key={view.id}
          title={title}
          message="Invalid series result"
        />
      );
    }
    return <LineChartCard key={view.id} metric={metric} points={state.result.points} />;
  }

  if (view.type === "bar_chart") {
    if (state.result.kind !== "series") {
      return (
        <ErrorCard
          key={view.id}
          title={title}
          message="Invalid series result"
        />
      );
    }
    return <BarChartCard key={view.id} metric={metric} points={state.result.points} />;
  }

  return (
    <ErrorCard
      key={view.id}
      title={title}
      message={`Unknown view type: ${(view as { type: string }).type}`}
    />
  );
}

export function renderDashboard(
  spec: DashboardSpec,
  stateByViewId?: Record<string, DashboardViewState>,
) {
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
        {spec.views.map((view) => renderView(view, metricsById, stateByViewId))}
      </div>
    </div>
  );
}
