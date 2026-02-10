"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { HeatmapComponent, validateHeatmapProps } from "./heatmap-component";

// Types
import { DashboardSpec } from "@/lib/spec/dashboardSpec";

export type ComponentProps = {
  component: any; // Using any for component schema temporarily
  state: Record<string, any>;
  onEvent: (eventName: string, args?: any) => void;
  renderChildren?: (children: any[]) => React.ReactNode;
};

export type ComponentRenderer = {
  render: React.FC<ComponentProps>;
  validateProps?: (props: any) => void;
  supportedEvents?: string[];
};

// 1. Component Implementation
const ButtonComponent = ({ component, onEvent }: ComponentProps) => {
  return (
    <Button
      onClick={() => onEvent("onClick")}
      disabled={component.properties?.disabled}
      className={component.properties?.className}
    >
      {component.label || "Button"}
    </Button>
  );
};

const TextComponent = ({ component, state }: ComponentProps) => {
  let content = String(component.properties?.content || component.label || "");
  // Resolve bindings {{state.foo}}
  content = content.replace(/{{(.*?)}}/g, (_, key) => {
    const val = state[key.trim()];
    return val !== undefined ? String(val) : "";
  });

  return (
    <div className="prose dark:prose-invert">
      {content}
    </div>
  );
};

const TextInputComponent = ({ component, state, onEvent }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const value = bindKey ? state[bindKey] || "" : "";

  return (
    <div className="space-y-2">
      {component.label && <label className="text-sm font-medium">{component.label}</label>}
      <Input
        placeholder={component.properties?.placeholder}
        value={value}
        onChange={(e) => onEvent("onChange", { value: e.target.value, bindKey })}
      />
    </div>
  );
};

const CheckboxComponent = ({ component, state, onEvent }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const checked = bindKey ? Boolean(state[bindKey]) : Boolean(component.properties?.checked);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onEvent("onChange", { value: e.target.checked, bindKey })}
      />
      {component.label || component.properties?.label || "Checkbox"}
    </label>
  );
};

const DatePickerComponent = ({ component, state, onEvent }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const value = bindKey ? state[bindKey] || "" : "";
  return (
    <div className="space-y-2">
      {component.label && <label className="text-sm font-medium">{component.label}</label>}
      <Input
        type="date"
        value={value}
        onChange={(e) => onEvent("onChange", { value: e.target.value, bindKey })}
      />
    </div>
  );
};

const TabsComponent = ({ component, renderChildren }: ComponentProps) => {
  const children = component.children || [];
  const [activeIndex, setActiveIndex] = React.useState(0);
  const active = children[activeIndex];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {children.map((child: any, index: number) => (
          <button
            key={child.id || index}
            className={[
              "rounded-md border px-3 py-1 text-xs",
              index === activeIndex ? "border-primary text-foreground" : "border-border/60 text-muted-foreground",
            ].join(" ")}
            type="button"
            onClick={() => setActiveIndex(index)}
          >
            {child.label || child.name || `Tab ${index + 1}`}
          </button>
        ))}
      </div>
      {renderChildren && active ? renderChildren([active]) : null}
    </div>
  );
};

const SelectComponent = ({ component, state, onEvent }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const value = bindKey ? state[bindKey] || "" : undefined;
  const options = component.properties?.options || [];

  return (
    <div className="space-y-2">
      {component.label && <label className="text-sm font-medium">{component.label}</label>}
      <Select
        value={value}
        onValueChange={(val: string) => onEvent("onChange", { value: val, bindKey })}
      >
        <SelectTrigger>
          <SelectValue placeholder={component.properties?.placeholder || "Select option"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt: any) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

const TableComponent = ({ component, state }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  // Support direct data property or state binding
  const data = bindKey ? state[bindKey] : (component.properties?.data || []);
  const rows = Array.isArray(data) ? data : [];

  return (
    <Card className="h-full">
      <CardHeader className="py-3">
        <CardTitle className="text-sm font-medium">{component.label || "Table"}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {rows.length > 0 ? (
                  Object.keys(rows[0]).slice(0, 6).map((key) => (
                    <TableHead key={key}>{key}</TableHead>
                  ))
                ) : (
                  <TableHead>Data</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length > 0 ? (
                rows.slice(0, 50).map((row: any, i: number) => (
                  <TableRow key={i}>
                    {Object.keys(row).slice(0, 6).map((key) => (
                      <TableCell key={key}>
                        {typeof row[key] === "object" ? JSON.stringify(row[key]) : String(row[key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                    No data available
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

const ContainerComponent = ({ component, renderChildren }: ComponentProps) => {
  return (
    <div className={`grid gap-4 ${component.layoutMode === 'stack' ? 'flex flex-col' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'}`}>
      {renderChildren && renderChildren(component.children || [])}
    </div>
  );
};

const StatusComponent = ({ component, state }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const value = bindKey ? state[bindKey] : (component.properties?.value || "Unknown");

  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  const statusStr = String(value).toLowerCase();

  if (statusStr === "success" || statusStr === "completed" || statusStr === "active") variant = "default"; // green-ish in some themes, or we rely on class
  else if (statusStr === "error" || statusStr === "failed") variant = "destructive";
  else if (statusStr === "pending" || statusStr === "running") variant = "secondary";
  else variant = "outline";

  return (
    <div className="flex items-center gap-2">
      {component.label && <span className="text-sm font-medium">{component.label}:</span>}
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variant === 'default' ? 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80' :
        variant === 'secondary' ? 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80' :
          variant === 'destructive' ? 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80' :
            'text-foreground'
        }`}>
        {String(value)}
      </span>
    </div>
  );
};

// Chart Helper
const resolveChartData = (component: any, state: any) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const data = bindKey ? state[bindKey] : (component.properties?.data || []);
  return Array.isArray(data) ? data : [];
};

const LineChartComponent = ({ component, state }: ComponentProps) => {
  const data = resolveChartData(component, state);
  const xKey = component.properties?.xAxis || "date";
  const yKey = component.properties?.yAxis || "value";
  const label = component.label || "Line Chart";

  return (
    <Card className="h-full min-h-[300px]">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey={xKey}
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={yKey}
                stroke="currentColor"
                strokeWidth={2}
                className="stroke-primary"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const BarChartComponent = ({ component, state }: ComponentProps) => {
  const data = resolveChartData(component, state);
  const xKey = component.properties?.xAxis || "date";
  const yKey = component.properties?.yAxis || "value";
  const label = component.label || "Bar Chart";

  return (
    <Card className="h-full min-h-[300px]">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey={xKey}
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              <Bar
                dataKey={yKey}
                fill="currentColor"
                radius={[4, 4, 0, 0]}
                className="fill-primary"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

// 2. Registry Definition

// Visualization Component (Generic Wrapper)
const VisualizationComponent = (props: ComponentProps) => {
  const { component } = props;
  const kind = component.properties?.kind || "heatmap";

  if (kind === "heatmap") {
    return <HeatmapComponent {...props} />;
  }

  // Future extensions: scatter, calendar, etc.

  return (
    <div className="p-4 border border-destructive/50 text-destructive bg-destructive/5 rounded-md">
      Unsupported visualization kind: {kind}
    </div>
  );
};

// KPI Tile Component (for Executive Dashboard)
const KpiTileComponent = ({ component, state }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const data = bindKey ? state[bindKey] : {
    value: component.properties?.value || component.value || "—",
    trend: component.properties?.trend || component.trend || "",
    status: component.properties?.status || component.status || "neutral",
  };

  const statusColors: Record<string, string> = {
    healthy: "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
    warning: "bg-amber-500/10 border-amber-500/30 text-amber-600",
    critical: "bg-red-500/10 border-red-500/30 text-red-600",
    "on-track": "bg-blue-500/10 border-blue-500/30 text-blue-600",
    neutral: "bg-muted border-border text-muted-foreground",
  };

  const trendColor = data.trend?.startsWith("+") ? "text-emerald-600" : data.trend?.startsWith("-") ? "text-red-500" : "text-muted-foreground";
  const statusClass = statusColors[data.status] || statusColors.neutral;

  return (
    <Card className={`relative overflow-hidden border-2 ${statusClass} transition-all duration-300 hover:scale-[1.02] hover:shadow-lg`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{component.label}</p>
            <p className="mt-1 text-3xl font-bold tracking-tight">{data.value}</p>
          </div>
          {data.trend && (
            <span className={`text-sm font-semibold ${trendColor}`}>{data.trend}</span>
          )}
        </div>
        <div className={`absolute -bottom-2 -right-2 h-16 w-16 rounded-full opacity-20 ${data.status === "healthy" ? "bg-emerald-500" : data.status === "warning" ? "bg-amber-500" : data.status === "critical" ? "bg-red-500" : "bg-blue-500"}`} />
      </CardContent>
    </Card>
  );
};

// Alert Banner Component (for Risk Correlation)
const AlertBannerComponent = ({ component, state }: ComponentProps) => {
  const bindKey = component.dataSource?.type === "state" ? component.dataSource.value : undefined;
  const alerts = bindKey ? state[bindKey] : (component.properties?.data || []);
  const severity = component.severity || component.properties?.severity || "info";

  const severityStyles: Record<string, string> = {
    critical: "bg-gradient-to-r from-red-600 to-red-500 text-white border-red-700",
    high: "bg-gradient-to-r from-amber-500 to-orange-500 text-white border-amber-600",
    medium: "bg-gradient-to-r from-yellow-400 to-amber-400 text-black border-yellow-500",
    info: "bg-gradient-to-r from-blue-500 to-indigo-500 text-white border-blue-600",
  };

  if (!Array.isArray(alerts) || alerts.length === 0) return null;

  const alert = alerts[0];
  return (
    <div className={`rounded-xl border-2 px-6 py-4 ${severityStyles[severity]} animate-pulse shadow-lg`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="font-bold text-lg">{component.label || "Alert"}</p>
            <p className="text-sm opacity-90">{alert.message}</p>
          </div>
        </div>
        {alert.accounts && (
          <div className="text-right">
            <p className="text-xs uppercase opacity-80">Affected Accounts</p>
            <p className="font-semibold">{alert.accounts.join(", ")}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper to wrap simple components
const simple = (render: React.FC<ComponentProps>, supportedEvents: string[] = []): ComponentRenderer => ({
  render,
  supportedEvents
});

export const COMPONENT_REGISTRY: Record<string, ComponentRenderer> = {
  // Primitives
  Button: simple(ButtonComponent, ["onClick"]),
  Text: simple(TextComponent),
  Container: simple(ContainerComponent),

  // Inputs
  TextInput: simple(TextInputComponent, ["onChange"]),
  Select: simple(SelectComponent, ["onChange"]),
  Dropdown: simple(SelectComponent, ["onChange"]), // Alias

  // Outputs
  Table: simple(TableComponent),
  LineChart: simple(LineChartComponent),
  BarChart: simple(BarChartComponent),
  Status: simple(StatusComponent),
  Heatmap: {
    render: HeatmapComponent,
    validateProps: validateHeatmapProps,
    supportedEvents: []
  },
  Visualization: {
    render: VisualizationComponent,
    supportedEvents: []
  },

  // Layout / Other
  Form: simple(ContainerComponent), // Alias for now

  // Legacy / Lowercase Aliases
  button: simple(ButtonComponent, ["onClick"]),
  text: simple(TextComponent),
  input: simple(TextInputComponent, ["onChange"]),
  textinput: simple(TextInputComponent, ["onChange"]),
  select: simple(SelectComponent, ["onChange"]),
  dropdown: simple(SelectComponent, ["onChange"]),
  table: simple(TableComponent),
  container: simple(ContainerComponent),
  form: simple(ContainerComponent),
  modal: simple(ContainerComponent),
  status: simple(StatusComponent),
  linechart: simple(LineChartComponent),
  barchart: simple(BarChartComponent),
  heatmap: {
    render: HeatmapComponent,
    validateProps: validateHeatmapProps,
    supportedEvents: []
  },
  visualization: {
    render: VisualizationComponent,
    supportedEvents: []
  },

  // Dashboard Fallbacks
  metric: simple(TextComponent),
  chart: simple(LineChartComponent),

  Checkbox: simple(CheckboxComponent, ["onChange"]),
  DatePicker: simple(DatePickerComponent, ["onChange"]),
  Grid: simple(ContainerComponent),
  Tabs: simple(TabsComponent),
  Markdown: simple(TextComponent),

  // Demo Dashboard Components
  Kpi: simple(KpiTileComponent),
  kpi: simple(KpiTileComponent),
  KpiTile: simple(KpiTileComponent),
  kpitile: simple(KpiTileComponent),
  AlertBanner: simple(AlertBannerComponent),
  alertbanner: simple(AlertBannerComponent),
};


export function getComponent(type: string): ComponentRenderer {
  // Try exact match first, then lowercase
  const Comp = COMPONENT_REGISTRY[type] || COMPONENT_REGISTRY[type.toLowerCase()];

  if (!Comp) {
    // If we have a chart type that isn't registered, fallback to line chart if it looks like a chart
    if (type.toLowerCase().includes("chart")) {
      return simple(LineChartComponent);
    }

    // Hard fail as requested
    // Note: The pre-render check in runtime should catch this first, 
    // but if we get here during render, we must fail.
    const errorMsg = JSON.stringify({
      error: "unsupported_component",
      componentType: type,
      allowedTypes: Object.keys(COMPONENT_REGISTRY)
    });
    throw new Error(errorMsg);
  }
  return Comp;
}
