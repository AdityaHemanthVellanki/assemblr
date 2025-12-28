"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GenerateDashboardForm } from "@/components/dashboard/generate-dashboard-form";
import { renderDashboard } from "@/lib/dashboard/render-dashboard";
import { parseDashboardSpec, type DashboardSpec } from "@/lib/dashboard/spec";
import { cn } from "@/lib/ui/cn";

type ProjectPayload = {
  id: string;
  name: string;
  spec: DashboardSpec;
};

function stringifyZodError(err: unknown): string {
  if (!err || typeof err !== "object") return "Validation failed";
  if (!("issues" in err)) return "Validation failed";
  const issues = (
    err as { issues?: Array<{ path?: unknown; message?: unknown }> }
  ).issues;
  if (!Array.isArray(issues) || issues.length === 0) return "Validation failed";

  return issues
    .slice(0, 8)
    .map((i) => {
      const path = Array.isArray(i.path) ? i.path.join(".") : "";
      const message = typeof i.message === "string" ? i.message : "Invalid";
      return path ? `${path}: ${message}` : message;
    })
    .join("\n");
}

function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {children}
    </select>
  );
}

function StableId({ value }: { value: string }) {
  return (
    <div className="text-xs text-muted-foreground">
      <span className="font-mono">{value}</span>
    </div>
  );
}

function arrayMove<T>(arr: T[], from: number, to: number) {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function SpecEditorPanel({ project }: { project: ProjectPayload }) {
  const [savedSpec, setSavedSpec] = React.useState<DashboardSpec>(project.spec);
  const [draftSpec, setDraftSpec] = React.useState<DashboardSpec>(project.spec);

  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const isDirty = JSON.stringify(draftSpec) !== JSON.stringify(savedSpec);

  React.useEffect(() => {
    const key = `assemblr:project:${project.id}:specEdited`;
    try {
      const edited = window.localStorage.getItem(key) === "true";
      setStatusText(edited ? "User-edited" : "AI-generated");
    } catch {
      setStatusText("AI-generated");
    }
  }, [project.id]);

  function markUserEdited() {
    const key = `assemblr:project:${project.id}:specEdited`;
    try {
      window.localStorage.setItem(key, "true");
    } catch {
      // ignore
    }
    setStatusText("User-edited");
  }

  function markAiGenerated() {
    const key = `assemblr:project:${project.id}:specEdited`;
    try {
      window.localStorage.setItem(key, "false");
    } catch {
      // ignore
    }
    setStatusText("AI-generated");
  }

  function applySpecUpdate(buildNext: (prev: DashboardSpec) => DashboardSpec) {
    setErrorText(null);
    setDraftSpec((prev) => {
      try {
        const next = buildNext(prev);
        return parseDashboardSpec(next);
      } catch (err) {
        setErrorText(stringifyZodError(err));
        return prev;
      }
    });
  }

  async function onSave() {
    setErrorText(null);
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/spec`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec: draftSpec }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Failed to save changes");
      }

      const data = (await res.json()) as { project: ProjectPayload };
      setSavedSpec(data.project.spec);
      setDraftSpec(data.project.spec);
      markUserEdited();
    } catch (err) {
      setErrorText(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function onResetDraft() {
    if (!isDirty) return;
    const ok = window.confirm("Discard unsaved changes?");
    if (!ok) return;
    setErrorText(null);
    setDraftSpec(savedSpec);
  }

  function metricLabelById(id: string) {
    return draftSpec.metrics.find((m) => m.id === id)?.label ?? id;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <GenerateDashboardForm
          projectId={project.id}
          onGenerated={(p) => {
            setErrorText(null);
            markAiGenerated();
            const nextSpec = parseDashboardSpec(p.spec);
            setSavedSpec(nextSpec);
            setDraftSpec(nextSpec);
          }}
        />

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-sm font-medium">
                  Spec editor
                </CardTitle>
                <div className="text-xs text-muted-foreground">
                  Status: {statusText ?? "…"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Changes update the preview immediately. Saving is manual.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onResetDraft}
                  disabled={!isDirty || isSaving}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  onClick={onSave}
                  disabled={!isDirty || isSaving}
                >
                  {isSaving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
            {errorText ? (
              <div className="whitespace-pre-line rounded-md border border-border bg-accent px-3 py-2 text-sm">
                {errorText}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Dashboard
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Title</div>
                    <Input
                      value={draftSpec.title}
                      onChange={(e) =>
                        applySpecUpdate((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      Description
                    </div>
                    <Input
                      value={draftSpec.description ?? ""}
                      onChange={(e) =>
                        applySpecUpdate((prev) => ({
                          ...prev,
                          description: e.target.value.trim().length
                            ? e.target.value
                            : undefined,
                        }))
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Metrics ({draftSpec.metrics.length})
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    applySpecUpdate((prev) => ({
                      ...prev,
                      metrics: [
                        ...prev.metrics,
                        {
                          id: crypto.randomUUID(),
                          label: "New Metric",
                          type: "count",
                          table: "events",
                        },
                      ],
                    }));
                  }}
                >
                  Add metric
                </Button>
              </div>

              <div className="space-y-3">
                {draftSpec.metrics.map((metric) => (
                  <details
                    key={metric.id}
                    className="rounded-md border border-border"
                    open={metric.id === draftSpec.metrics[0]?.id}
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {metric.label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {metric.type} · {metric.table}
                            {metric.type === "sum" && metric.field
                              ? `.${metric.field}`
                              : ""}
                            {metric.groupBy
                              ? ` · groupBy=${metric.groupBy}`
                              : ""}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            if (draftSpec.metrics.length <= 1) {
                              setErrorText("You must keep at least 1 metric.");
                              return;
                            }
                            const dependentViews = draftSpec.views.filter(
                              (v) =>
                                v.type !== "table" && v.metricId === metric.id,
                            );
                            const msg =
                              dependentViews.length > 0
                                ? `This metric is used by ${dependentViews.length} view(s). Remove the metric AND those views?`
                                : "Remove this metric?";
                            const ok = window.confirm(msg);
                            if (!ok) return;

                            applySpecUpdate((prev) => ({
                              ...prev,
                              metrics: prev.metrics.filter(
                                (m) => m.id !== metric.id,
                              ),
                              views:
                                dependentViews.length > 0
                                  ? prev.views.filter(
                                      (v) =>
                                        v.type === "table" ||
                                        v.metricId !== metric.id,
                                    )
                                  : prev.views,
                            }));
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      <StableId value={metric.id} />
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Label
                          </div>
                          <Input
                            value={metric.label}
                            onChange={(e) =>
                              applySpecUpdate((prev) => ({
                                ...prev,
                                metrics: prev.metrics.map((m) =>
                                  m.id === metric.id
                                    ? { ...m, label: e.target.value }
                                    : m,
                                ),
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Type
                          </div>
                          <Select
                            value={metric.type}
                            onChange={(value) => {
                              applySpecUpdate((prev) => ({
                                ...prev,
                                metrics: prev.metrics.map((m) => {
                                  if (m.id !== metric.id) return m;
                                  const nextType =
                                    value === "sum"
                                      ? ("sum" as const)
                                      : ("count" as const);
                                  if (nextType === "count") {
                                    return {
                                      ...m,
                                      type: "count",
                                      field: undefined,
                                    };
                                  }
                                  return {
                                    ...m,
                                    type: "sum",
                                    field: m.field?.trim().length
                                      ? m.field
                                      : "amount",
                                  };
                                }),
                              }));
                            }}
                          >
                            <option value="count">count</option>
                            <option value="sum">sum</option>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Table
                          </div>
                          <Input
                            value={metric.table}
                            onChange={(e) =>
                              applySpecUpdate((prev) => ({
                                ...prev,
                                metrics: prev.metrics.map((m) =>
                                  m.id === metric.id
                                    ? { ...m, table: e.target.value }
                                    : m,
                                ),
                              }))
                            }
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Grouping
                          </div>
                          <Select
                            value={metric.groupBy ?? ""}
                            onChange={(value) => {
                              applySpecUpdate((prev) => ({
                                ...prev,
                                metrics: prev.metrics.map((m) =>
                                  m.id === metric.id
                                    ? {
                                        ...m,
                                        groupBy:
                                          value === "day" ? "day" : undefined,
                                      }
                                    : m,
                                ),
                              }));
                            }}
                          >
                            <option value="">(none)</option>
                            <option value="day">day</option>
                          </Select>
                        </div>

                        {metric.type === "sum" ? (
                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground">
                              Field
                            </div>
                            <Input
                              value={metric.field ?? ""}
                              onChange={(e) =>
                                applySpecUpdate((prev) => ({
                                  ...prev,
                                  metrics: prev.metrics.map((m) =>
                                    m.id === metric.id
                                      ? { ...m, field: e.target.value }
                                      : m,
                                  ),
                                }))
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </details>
                ))}
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-medium text-muted-foreground">
                  Views ({draftSpec.views.length})
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    const firstMetricId = draftSpec.metrics[0]?.id;
                    if (!firstMetricId) {
                      setErrorText("Add a metric before adding a view.");
                      return;
                    }
                    applySpecUpdate((prev) => ({
                      ...prev,
                      views: [
                        ...prev.views,
                        {
                          id: crypto.randomUUID(),
                          type: "metric",
                          metricId: firstMetricId,
                        },
                      ],
                    }));
                  }}
                >
                  Add view
                </Button>
              </div>

              <div className="space-y-3">
                {draftSpec.views.map((view, idx) => (
                  <details
                    key={view.id}
                    className="rounded-md border border-border"
                    open={idx === 0}
                  >
                    <summary className="cursor-pointer select-none px-3 py-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {view.type === "table"
                              ? `table · ${view.table}`
                              : `${view.type} · ${metricLabelById(view.metricId!)}`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {idx + 1} / {draftSpec.views.length}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={(e) => {
                              e.preventDefault();
                              if (idx === 0) return;
                              applySpecUpdate((prev) => ({
                                ...prev,
                                views: arrayMove(prev.views, idx, idx - 1),
                              }));
                            }}
                            disabled={idx === 0}
                          >
                            Up
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={(e) => {
                              e.preventDefault();
                              if (idx === draftSpec.views.length - 1) return;
                              applySpecUpdate((prev) => ({
                                ...prev,
                                views: arrayMove(prev.views, idx, idx + 1),
                              }));
                            }}
                            disabled={idx === draftSpec.views.length - 1}
                          >
                            Down
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={(e) => {
                              e.preventDefault();
                              if (draftSpec.views.length <= 1) {
                                setErrorText("You must keep at least 1 view.");
                                return;
                              }
                              const ok = window.confirm("Remove this view?");
                              if (!ok) return;
                              applySpecUpdate((prev) => ({
                                ...prev,
                                views: prev.views.filter(
                                  (v) => v.id !== view.id,
                                ),
                              }));
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </summary>
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      <StableId value={view.id} />
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">
                            Type
                          </div>
                          <Select
                            value={view.type}
                            onChange={(value) => {
                              const firstMetricId = draftSpec.metrics[0]?.id;
                              applySpecUpdate((prev) => ({
                                ...prev,
                                views: prev.views.map((v) => {
                                  if (v.id !== view.id) return v;
                                  if (value === "table") {
                                    return {
                                      id: v.id,
                                      type: "table",
                                      table:
                                        v.type === "table" ? v.table : "events",
                                    };
                                  }
                                  const nextType =
                                    value === "metric" ||
                                    value === "line_chart" ||
                                    value === "bar_chart"
                                      ? value
                                      : "metric";
                                  const metricId =
                                    v.type !== "table"
                                      ? v.metricId
                                      : (firstMetricId ?? "");
                                  return { id: v.id, type: nextType, metricId };
                                }),
                              }));
                            }}
                          >
                            <option value="metric">metric</option>
                            <option value="line_chart">line_chart</option>
                            <option value="bar_chart">bar_chart</option>
                            <option value="table">table</option>
                          </Select>
                        </div>

                        {view.type === "table" ? (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              Table
                            </div>
                            <Input
                              value={view.table ?? ""}
                              onChange={(e) =>
                                applySpecUpdate((prev) => ({
                                  ...prev,
                                  views: prev.views.map((v) =>
                                    v.id === view.id
                                      ? {
                                          id: v.id,
                                          type: "table",
                                          table: e.target.value,
                                        }
                                      : v,
                                  ),
                                }))
                              }
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground">
                              Metric
                            </div>
                            <Select
                              value={view.metricId ?? ""}
                              onChange={(value) => {
                                applySpecUpdate((prev) => ({
                                  ...prev,
                                  views: prev.views.map((v) =>
                                    v.id === view.id
                                      ? { ...v, metricId: value }
                                      : v,
                                  ),
                                }));
                              }}
                            >
                              {draftSpec.metrics.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="text-xs font-medium text-muted-foreground">Preview</div>
        {renderDashboard(draftSpec)}
      </div>
    </div>
  );
}
