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
    const mode = component.properties?.layoutMode ?? "grid";
    const className =
      mode === "stack"
        ? "flex flex-col gap-4"
        : "grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
    return <div className={className}>{renderChildren(component.children ?? [])}</div>;
  },
};

const PanelComponent: MiniAppComponent = {
  type: "panel",
  render: ({ component, state, renderChildren }) => {
    const bindKey = getBindKey(component);
    const data = bindKey ? state[bindKey] : component.dataSource?.value;
    const title = component.label ?? component.properties?.title;
    const fields = component.properties?.fields ?? [];

    if (!data) {
      return (
        <Card className="h-full">
          {title ? (
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
            </CardHeader>
          ) : null}
          <CardContent className="pt-0 text-sm text-muted-foreground">
            <div className="p-4 text-center">No details available</div>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="h-full">
        {title ? (
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">{String(title)}</CardTitle>
          </CardHeader>
        ) : null}
        <CardContent className={title ? "pt-0" : "pt-6"}>
          <div className="space-y-4">
            <div className="grid gap-2">
              {Array.isArray(fields) &&
                fields.map((field: string) => {
                  const val = data[field];
                  return (
                    <div key={field} className="grid grid-cols-3 gap-2 text-sm">
                      <div className="font-medium text-muted-foreground capitalize">
                        {field.replace(/_/g, " ")}
                      </div>
                      <div className="col-span-2 break-words" title={String(val)}>
                        {String(val ?? "-")}
                      </div>
                    </div>
                  );
                })}
            </div>
            {component.children?.length ? (
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                {renderChildren(component.children)}
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  },
};

const BannerComponent: MiniAppComponent = {
  type: "banner",
  render: ({ component, state }) => {
    const visibleIf = component.properties?.visibleIf;
    let isVisible = true;

    if (visibleIf !== undefined) {
      if (typeof visibleIf === "boolean") isVisible = visibleIf;
      else if (typeof visibleIf === "string") {
        const match = visibleIf.match(/^{{state\.([a-zA-Z0-9_.$-]+)}}$/);
        if (match) {
          isVisible = !!state[match[1]];
        }
      }
    }

    if (!isVisible) return null;

    const message = component.properties?.message ?? component.label ?? "Alert";
    const severity = component.properties?.severity ?? "info";

    let styles =
      "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-900/30 dark:text-blue-100 dark:border-blue-800";
    if (severity === "warning")
      styles =
        "bg-yellow-50 text-yellow-900 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-100 dark:border-yellow-800";
    if (severity === "error")
      styles =
        "bg-red-50 text-red-900 border-red-200 dark:bg-red-900/30 dark:text-red-100 dark:border-red-800";

    return <div className={`rounded-md border p-4 text-sm ${styles}`}>{String(message)}</div>;
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
  panel: PanelComponent,
  Panel: PanelComponent,
  banner: BannerComponent,
  Banner: BannerComponent,
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
