"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type MiniAppComponentSpec = {
  id: string;
  type: string;
  label?: string;
  properties?: Record<string, any>;
  dataSource?: { type: "static" | "state" | "expression"; value: any };
  events?: Array<{ type: string; actionId: string; args?: Record<string, any> }>;
  children?: MiniAppComponentSpec[];
  layout?: { w?: number; h?: number };
};

export type MiniAppActionAPI = {
  dispatch: (actionId: string, payload?: Record<string, any>) => void;
};

export type MiniAppRenderCtx = {
  state: Record<string, any>;
  actions: MiniAppActionAPI;
  emit: (eventName: string, payload?: any) => void;
  setState: (partial: Record<string, any>) => void;
};

export type MiniAppComponent = {
  type: string;
  render: (ctx: MiniAppRenderCtx & { component: MiniAppComponentSpec; renderChildren: (children: MiniAppComponentSpec[]) => React.ReactNode }) => React.ReactNode;
};

function normalizeOptions(raw: any, labelKey: string, valueKey: string): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((opt) => {
      if (opt == null) return null;
      if (typeof opt === "string" || typeof opt === "number" || typeof opt === "boolean") {
        return { label: String(opt), value: String(opt) };
      }
      if (typeof opt === "object") {
        const rec = opt as Record<string, any>;
        const value = rec[valueKey] ?? rec.value ?? rec.id ?? rec.name;
        const label = rec[labelKey] ?? rec.label ?? rec.name ?? rec.id ?? value;
        if (value == null) return null;
        return { label: String(label), value: String(value) };
      }
      return null;
    })
    .filter(Boolean) as Array<{ label: string; value: string }>;
}

function getBindKey(component: MiniAppComponentSpec): string | undefined {
  if (component.dataSource?.type === "state" && typeof component.dataSource.value === "string") {
    return component.dataSource.value;
  }
  const maybe = component.properties?.bindKey;
  return typeof maybe === "string" && maybe.length ? maybe : undefined;
}

const ButtonComponent: MiniAppComponent = {
  type: "button",
  render: ({ component, emit }) => {
    const label = component.properties?.text ?? component.label ?? "Button";
    return (
      <Button disabled={!!component.properties?.disabled} onClick={() => emit("onClick")}>
        {String(label)}
      </Button>
    );
  },
};

const TextComponent: MiniAppComponent = {
  type: "text",
  render: ({ component, state }) => {
    const raw = component.properties?.content ?? component.label ?? "";
    const content = typeof raw === "string"
      ? raw.replace(/{{state\.([a-zA-Z0-9_.$-]+)}}/g, (_, key) => {
          const val = state[key];
          return val === undefined || val === null ? "" : String(val);
        })
      : String(raw);
    return <div className="text-sm">{content}</div>;
  },
};

const TextInputComponent: MiniAppComponent = {
  type: "input",
  render: ({ component, state, setState, emit }) => {
    const bindKey = getBindKey(component);
    const value = bindKey ? state[bindKey] ?? "" : component.properties?.value ?? "";
    const placeholder = component.properties?.placeholder;
    return (
      <div className="space-y-2">
        {component.label ? <div className="text-sm font-medium">{component.label}</div> : null}
        <Input
          value={String(value ?? "")}
          placeholder={typeof placeholder === "string" ? placeholder : undefined}
          onChange={(e) => {
            const next = e.target.value;
            if (bindKey) setState({ [bindKey]: next });
            emit("onChange", { value: next, bindKey });
          }}
        />
      </div>
    );
  },
};

const DropdownComponent: MiniAppComponent = {
  type: "dropdown",
  render: ({ component, state, setState, emit }) => {
    const bindKey = getBindKey(component);
    const selected = bindKey ? (state[bindKey] ?? "") : (component.properties?.value ?? "");

    const labelKey = typeof component.properties?.optionLabelKey === "string" ? component.properties.optionLabelKey : "label";
    const valueKey = typeof component.properties?.optionValueKey === "string" ? component.properties.optionValueKey : "value";

    const rawOptions =
      Array.isArray(component.properties?.options)
        ? component.properties.options
        : component.dataSource?.type === "state" && typeof component.dataSource.value === "string"
          ? state[component.dataSource.value]
          : [];

    const options = normalizeOptions(rawOptions, labelKey, valueKey);
    const placeholder = typeof component.properties?.placeholder === "string" ? component.properties.placeholder : "Select";

    return (
      <div className="space-y-2">
        {component.label ? <div className="text-sm font-medium">{component.label}</div> : null}
        <Select
          value={String(selected ?? "")}
          onValueChange={(val) => {
            if (bindKey) setState({ [bindKey]: val });
            emit("onChange", { value: val, bindKey });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  },
};

const ListComponent: MiniAppComponent = {
  type: "list",
  render: ({ component, state }) => {
    const bindKey = getBindKey(component);
    const raw = bindKey ? state[bindKey] : component.properties?.items;
    const items = Array.isArray(raw) ? raw : [];
    const title = component.label ?? component.properties?.title ?? "List";
    const itemKey = typeof component.properties?.itemKey === "string" ? component.properties.itemKey : undefined;
    const itemLabelKey = typeof component.properties?.itemLabelKey === "string" ? component.properties.itemLabelKey : "name";

    return (
      <Card className="h-full">
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground">No items</div>
          ) : (
            <div className="space-y-2">
              {items.slice(0, 200).map((it, idx) => {
                const key =
                  itemKey && it && typeof it === "object" && (it as any)[itemKey] != null
                    ? String((it as any)[itemKey])
                    : String(idx);
                const label =
                  it && typeof it === "object"
                    ? String((it as any)[itemLabelKey] ?? (it as any).label ?? (it as any).id ?? idx)
                    : String(it);
                return (
                  <div key={key} className="rounded-md border px-3 py-2 text-sm">
                    {label}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
};

const CardComponent: MiniAppComponent = {
  type: "card",
  render: ({ component, renderChildren }) => {
    const title = component.label ?? component.properties?.title;
    return (
      <Card className="h-full">
        {title ? (
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
          </CardHeader>
        ) : null}
        <CardContent className={title ? "pt-0" : undefined}>
          {renderChildren(component.children ?? [])}
        </CardContent>
      </Card>
    );
  },
};

type HeatmapPoint = { day: number; hour: number; value: number };

function normalizeHeatmapData(raw: any): HeatmapPoint[] {
  if (!Array.isArray(raw)) return [];

  const points: HeatmapPoint[] = [];

  for (const item of raw) {
    if (item == null) continue;

    if (typeof item === "string" || typeof item === "number" || item instanceof Date) {
      const d = new Date(item as any);
      if (Number.isNaN(d.getTime())) continue;
      points.push({ day: d.getDay(), hour: d.getHours(), value: 1 });
      continue;
    }

    if (typeof item === "object") {
      const rec = item as Record<string, any>;
      const day = rec.day ?? rec.dow ?? rec.y;
      const hour = rec.hour ?? rec.h ?? rec.x;
      const value = rec.value ?? rec.count ?? rec.v ?? 1;
      if (typeof day === "number" && typeof hour === "number") {
        points.push({ day, hour, value: Number(value ?? 0) });
        continue;
      }
      if (rec.timestamp != null) {
        const d = new Date(rec.timestamp);
        if (Number.isNaN(d.getTime())) continue;
        points.push({ day: d.getDay(), hour: d.getHours(), value: Number(value ?? 1) });
        continue;
      }
    }
  }

  const agg = new Map<string, number>();
  for (const p of points) {
    const day = Math.max(0, Math.min(6, Math.floor(p.day)));
    const hour = Math.max(0, Math.min(23, Math.floor(p.hour)));
    const key = `${day}:${hour}`;
    agg.set(key, (agg.get(key) ?? 0) + (Number.isFinite(p.value) ? p.value : 0));
  }

  return Array.from(agg.entries()).map(([k, v]) => {
    const [dayStr, hourStr] = k.split(":");
    return { day: Number(dayStr), hour: Number(hourStr), value: v };
  });
}

function heatColor(value: number, maxValue: number): string {
  if (value <= 0) return "bg-muted";
  const t = value / Math.max(1, maxValue);
  if (t < 0.25) return "bg-green-200 dark:bg-green-900";
  if (t < 0.5) return "bg-green-400 dark:bg-green-700";
  if (t < 0.75) return "bg-green-600 dark:bg-green-500";
  return "bg-green-800 dark:bg-green-300";
}

const HeatmapComponent: MiniAppComponent = {
  type: "heatmap",
  render: ({ component, state }) => {
    const bindKey = getBindKey(component) ?? "commitTimes";
    const raw = component.dataSource?.type === "state" ? state[bindKey] : component.properties?.data;

    if (component.dataSource?.type === "state" && state[bindKey] === undefined) {
      return (
        <Card className="h-full min-h-[300px] animate-pulse">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">{component.label ?? "Heatmap"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[220px] rounded-md bg-muted" />
          </CardContent>
        </Card>
      );
    }

    const points = normalizeHeatmapData(raw);
    const maxValue = Math.max(1, ...points.map((p) => p.value));

    const title = component.label ?? component.properties?.title ?? "Heatmap";
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const byKey = new Map<string, number>();
    for (const p of points) byKey.set(`${p.day}:${p.hour}`, p.value);

    const hasAny = points.some((p) => p.value > 0);

    return (
      <Card className="h-full overflow-auto">
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {!hasAny ? (
            <div className="text-sm text-muted-foreground">No data</div>
          ) : (
            <div className="grid gap-1" style={{ gridTemplateColumns: `64px repeat(24, 16px)` }}>
              <div />
              {Array.from({ length: 24 }).map((_, hour) => (
                <div key={`h-${hour}`} className="text-[10px] text-muted-foreground text-center">
                  {hour % 3 === 0 ? hour : ""}
                </div>
              ))}

              {Array.from({ length: 7 }).map((_, day) => (
                <React.Fragment key={`row-${day}`}>
                  <div className="text-[11px] text-muted-foreground pr-2 text-right leading-4">
                    {dayLabels[day]}
                  </div>
                  {Array.from({ length: 24 }).map((__, hour) => {
                    const val = byKey.get(`${day}:${hour}`) ?? 0;
                    return (
                      <div
                        key={`c-${day}-${hour}`}
                        className={`h-4 w-4 rounded-sm ${heatColor(val, maxValue)}`}
                        title={`${val} at ${dayLabels[day]} ${hour}:00`}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
};

const ContainerComponent: MiniAppComponent = {
  type: "container",
  render: ({ component, renderChildren }) => {
    const layout = component.properties?.layout ?? "column";
    let className = "gap-4";

    if (layout === "row") {
      className += " flex flex-row flex-wrap items-start";
    } else if (layout === "column") {
      className += " flex flex-col";
    } else if (layout === "grid") {
      const cols = component.properties?.columns ?? 2;
      // Simple grid mapping
      if (cols === 3) className += " grid grid-cols-1 md:grid-cols-3";
      else if (cols === 4) className += " grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
      else className += " grid grid-cols-1 md:grid-cols-2";
    } else if (layout === "freeform") {
       className += " relative h-full min-h-[200px]"; 
    }

    // Support for "card" variant to simulate Panel
    if (component.properties?.variant === "card" || component.properties?.variant === "panel") {
      className += " border rounded-lg p-4 bg-card text-card-foreground shadow-sm";
    }

    return <div className={className}>{renderChildren(component.children ?? [])}</div>;
  },
};

const TableComponent: MiniAppComponent = {
  type: "table",
  render: ({ component, state }) => {
    const bindKey = getBindKey(component);
    const raw = bindKey ? state[bindKey] : component.properties?.data;
    const items = Array.isArray(raw) ? raw : [];
    const title = component.label ?? component.properties?.title;
    
    // Columns: [{ key: "id", label: "ID" }]
    const columns = Array.isArray(component.properties?.columns) 
      ? component.properties.columns 
      : (items.length > 0 && typeof items[0] === 'object' 
          ? Object.keys(items[0]).slice(0, 5).map(k => ({ key: k, label: k })) 
          : [{ key: "value", label: "Value" }]);

    return (
      <Card className="h-full flex flex-col overflow-hidden">
        {title ? (
          <CardHeader className="py-3 shrink-0">
            <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
          </CardHeader>
        ) : null}
        <div className="flex-1 overflow-auto min-h-[100px]">
          <table className="w-full text-sm text-left border-collapse">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                {columns.map((c: any) => (
                  <th key={c.key} className="p-2 font-medium border-b">{c.label ?? c.key}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.length === 0 ? (
                <tr><td colSpan={columns.length} className="p-4 text-center text-muted-foreground">No data</td></tr>
              ) : (
                items.map((item, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    {columns.map((c: any) => {
                      const val = typeof item === 'object' ? (item as any)[c.key] : item;
                      return (
                        <td key={c.key} className="p-2 border-b truncate max-w-[200px]" title={String(val)}>
                          {val === null || val === undefined ? "" : String(val)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    );
  },
};

export const MINI_APP_COMPONENTS: Record<string, MiniAppComponent> = {
  button: ButtonComponent,
  Button: ButtonComponent,
  text: TextComponent,
  Text: TextComponent,
  input: TextInputComponent,
  TextInput: TextInputComponent,
  dropdown: DropdownComponent,
  Dropdown: DropdownComponent,
  select: DropdownComponent,
  Select: DropdownComponent,
  list: ListComponent,
  List: ListComponent,
  card: CardComponent,
  Card: CardComponent,
  container: ContainerComponent,
  Container: ContainerComponent,
  heatmap: HeatmapComponent,
  Heatmap: HeatmapComponent,
  table: TableComponent,
  Table: TableComponent,
};


export function getMiniAppComponent(type: string): MiniAppComponent {
  const comp = MINI_APP_COMPONENTS[type] ?? MINI_APP_COMPONENTS[type.toLowerCase()];
  if (!comp) {
    const msg = JSON.stringify({
      error: "unsupported_component",
      componentType: type,
      allowedTypes: Object.keys(MINI_APP_COMPONENTS),
    });
    throw new Error(msg);
  }
  return comp;
}
