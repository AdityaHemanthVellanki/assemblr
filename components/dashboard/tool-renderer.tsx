"use client";

import * as React from "react";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import { isToolSystemSpec, type ViewSpec, type ActionSpec } from "@/lib/toolos/spec";
import { getCapability } from "@/lib/capabilities/registry";
import { linkEntities } from "@/lib/toolos/linking-engine";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExecutionTimeline, type TimelineStep } from "@/components/dashboard/execution-timeline";

type DataEvidence = {
  integration: string;
  entity: string;
  sampleCount: number;
  sampleFields: string[];
  fetchedAt: string;
  confidenceScore: number;
};

type ViewProjection = {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
};

type TriggerSummary = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  actionId?: string | null;
  workflowId?: string | null;
  condition: Record<string, any>;
  last_run_at?: string | null;
  next_run_at?: string | null;
  failure_count?: number;
};

type TriggerDraft = {
  cron: string;
  intervalMinutes: number;
  failureThreshold: number;
  enabled: boolean;
};

type BudgetSummary = {
  budget: { monthlyLimit: number; perRunLimit: number };
  usage: { monthKey: string; tokensUsed: number };
  costEstimate: number;
  projectedMonthlyTokens: number;
  projectedMonthlyCost: number;
};

export function ToolRenderer({ toolId, spec }: { toolId: string; spec: ToolSpec | null }) {
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
  const [activeEntityId, setActiveEntityId] = React.useState<string | null>(null);
  const [projection, setProjection] = React.useState<ViewProjection | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedRow, setSelectedRow] = React.useState<Record<string, any> | null>(null);
  const [toolState, setToolState] = React.useState<Record<string, any> | null>(null);
  const [evidenceMap, setEvidenceMap] = React.useState<Record<string, DataEvidence> | null>(null);
  const [allowWrites, setAllowWrites] = React.useState(false);
  const [runs, setRuns] = React.useState<Array<Record<string, any>>>([]);
  const [paused, setPaused] = React.useState(false);
  const autoFetchedRef = React.useRef<string | null>(null);
  const [runInspectorOpen, setRunInspectorOpen] = React.useState(false);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [runDetails, setRunDetails] = React.useState<Record<string, any> | null>(null);
  const [runDetailsLoading, setRunDetailsLoading] = React.useState(false);
  const [scrubIndex, setScrubIndex] = React.useState(0);
  const [triggers, setTriggers] = React.useState<TriggerSummary[]>([]);
  const [triggersLoading, setTriggersLoading] = React.useState(false);
  const [triggersError, setTriggersError] = React.useState<string | null>(null);
  const [triggerDrafts, setTriggerDrafts] = React.useState<Record<string, TriggerDraft>>({});
  const [budgetInfo, setBudgetInfo] = React.useState<BudgetSummary | null>(null);
  const [budgetLoading, setBudgetLoading] = React.useState(false);
  const [budgetDraft, setBudgetDraft] = React.useState<{ monthlyLimit: number; perRunLimit: number } | null>(null);

  const systemSpec = spec && isToolSystemSpec(spec) ? spec : null;

  React.useEffect(() => {
    if (!systemSpec) return;
    if (systemSpec.entities.length > 0) {
      const firstEntity = systemSpec.entities[0]?.name ?? null;
      const currentEntity = activeEntityId ?? firstEntity;
      if (!activeEntityId && firstEntity) {
        setActiveEntityId(firstEntity);
      }
      if (currentEntity) {
        const viewsForEntity = systemSpec.views.filter((view) => view.source.entity === currentEntity);
        if (viewsForEntity.length > 0) {
          if (!activeViewId || !viewsForEntity.some((view) => view.id === activeViewId)) {
            setActiveViewId(viewsForEntity[0].id);
          }
          return;
        }
      }
    }
    if (!activeViewId && systemSpec.views.length > 0) {
      setActiveViewId(systemSpec.views[0].id);
    }
  }, [systemSpec, activeEntityId, activeViewId]);

  const fetchView = React.useCallback(async (viewId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tools/${toolId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error ?? "Failed to load view");
      }
      setProjection(payload.view as ViewProjection);
      if (payload.state) {
        setToolState(payload.state as Record<string, any>);
      }
      if (payload.evidence) {
        setEvidenceMap(payload.evidence as Record<string, DataEvidence>);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load view");
    } finally {
      setIsLoading(false);
    }
  }, [toolId]);

  const runAction = React.useCallback(async (actionId: string, input?: Record<string, any>) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tools/${toolId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, viewId: activeViewId, input }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error ?? "Failed to run action");
      }
      if (payload.view) {
        setProjection(payload.view as ViewProjection);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run action");
    } finally {
      setIsLoading(false);
    }
  }, [activeViewId, toolId]);

  const fetchRuns = React.useCallback(async () => {
    const res = await fetch(`/api/tools/${toolId}/runs`);
    const payload = await res.json();
    if (res.ok) {
      setRuns(Array.isArray(payload.runs) ? payload.runs : []);
    }
  }, [toolId]);

  const fetchAutomation = React.useCallback(async () => {
    const res = await fetch(`/api/tools/${toolId}/automation`);
    const payload = await res.json();
    if (res.ok) {
      setPaused(payload.paused === true);
    }
  }, [toolId]);

  const fetchTriggers = React.useCallback(async () => {
    setTriggersLoading(true);
    setTriggersError(null);
    try {
      const res = await fetch(`/api/tools/${toolId}/triggers`);
      const payload = await res.json();
      if (!res.ok) {
        setTriggersError(payload?.error ?? "Failed to load triggers");
        setTriggers([]);
        return;
      }
      const items = Array.isArray(payload.triggers) ? payload.triggers : [];
      setTriggers(items);
      setPaused(payload.paused === true);
      setTriggerDrafts((prev) => {
        const next = { ...prev };
        for (const trigger of items) {
          if (!next[trigger.id]) {
            next[trigger.id] = {
              cron: trigger.condition?.cron ?? "",
              intervalMinutes: trigger.condition?.intervalMinutes ?? 1,
              failureThreshold: trigger.condition?.failureThreshold ?? 0,
              enabled: trigger.enabled,
            };
          }
        }
        return next;
      });
    } catch (err) {
      setTriggersError(err instanceof Error ? err.message : "Failed to load triggers");
      setTriggers([]);
    } finally {
      setTriggersLoading(false);
    }
  }, [toolId]);

  const fetchBudget = React.useCallback(async () => {
    setBudgetLoading(true);
    try {
      const res = await fetch(`/api/tools/${toolId}/budget`);
      const payload = await res.json();
      if (res.ok) {
        setBudgetInfo(payload);
        setBudgetDraft({
          monthlyLimit: payload?.budget?.monthlyLimit ?? 0,
          perRunLimit: payload?.budget?.perRunLimit ?? 0,
        });
      }
    } finally {
      setBudgetLoading(false);
    }
  }, [toolId]);

  const saveBudget = React.useCallback(
    async (patch: { monthlyLimit?: number; perRunLimit?: number }) => {
      await fetch(`/api/tools/${toolId}/budget`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await fetchBudget();
    },
    [toolId, fetchBudget],
  );

  const updateTriggerDraft = React.useCallback((id: string, patch: Partial<TriggerDraft>) => {
    setTriggerDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { cron: "", intervalMinutes: 1, failureThreshold: 0, enabled: true }), ...patch },
    }));
  }, []);

  const saveTrigger = React.useCallback(
    async (triggerId: string) => {
      const draft = triggerDrafts[triggerId];
      if (!draft) return;
      await fetch(`/api/tools/${toolId}/triggers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          triggerId,
          enabled: draft.enabled,
          cron: draft.cron || undefined,
          intervalMinutes: draft.intervalMinutes,
          failureThreshold: draft.failureThreshold,
        }),
      });
      await fetchTriggers();
    },
    [toolId, triggerDrafts, fetchTriggers],
  );

  const fetchRunDetails = React.useCallback(
    async (runId: string) => {
      setRunDetailsLoading(true);
      try {
        const res = await fetch(`/api/tools/${toolId}/runs/${runId}`);
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload?.error ?? "Failed to load run");
        }
        setRunDetails(payload.run ?? null);
        setScrubIndex(0);
      } catch (err) {
        setRunDetails(null);
      } finally {
        setRunDetailsLoading(false);
      }
    },
    [toolId],
  );

  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec) || !activeViewId) return;
    void fetchView(activeViewId);
  }, [spec, activeViewId, fetchView]);

  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec)) return;
    void fetchRuns();
    void fetchAutomation();
    void fetchTriggers();
    void fetchBudget();
  }, [spec, fetchRuns, fetchAutomation, fetchTriggers, fetchBudget]);

  React.useEffect(() => {
    if (!runInspectorOpen || !selectedRunId) return;
    void fetchRunDetails(selectedRunId);
  }, [runInspectorOpen, selectedRunId, fetchRunDetails]);

  const activeView = React.useMemo(
    () => systemSpec?.views.find((v) => v.id === activeViewId),
    [systemSpec, activeViewId],
  );
  const actionSpecs = React.useMemo(
    () => (systemSpec ? systemSpec.actions.filter((a) => activeView?.actions.includes(a.id)) : []),
    [systemSpec, activeView],
  );
  const rows = React.useMemo(
    () => normalizeRows(activeView, projection?.data),
    [activeView, projection?.data],
  );
  const evidence = activeView && evidenceMap ? evidenceMap[activeView.id] : null;
  const runStats = React.useMemo(() => {
    return runs.reduce(
      (acc, run) => {
        acc.total += 1;
        const status = run.status as string;
        acc[status] = (acc[status] ?? 0) + 1;
        return acc;
      },
      { total: 0 } as Record<string, number>,
    );
  }, [runs]);
  const errorHeatmap = React.useMemo(() => {
    const days = Array.from({ length: 7 }).map((_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        label: date.toLocaleDateString(),
        key: date.toISOString().slice(0, 10),
        count: 0,
      };
    });
    const map = new Map(days.map((d) => [d.key, d]));
    for (const run of runs) {
      if (run.status !== "failed") continue;
      const key = String(run.created_at).slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.count += 1;
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    return { days, max };
  }, [runs]);
  const integrationHealth = React.useMemo(() => {
    if (!systemSpec) return [];
    const evidenceIntegrations = new Set(
      Object.values(evidenceMap ?? {}).map((entry) => entry.integration),
    );
    return systemSpec.integrations.map((integration) => ({
      id: integration.id,
      status: evidenceIntegrations.has(integration.id) ? "healthy" : "unknown",
    }));
  }, [systemSpec, evidenceMap]);
  const links = React.useMemo(() => {
    if (!toolState || !systemSpec) return [];
    const emailView = systemSpec.views.find((v) => v.source.entity === "Email");
    const issueView = systemSpec.views.find((v) => v.source.entity === "Issue");
    if (!emailView || !issueView) return [];
    const emails = resolveState(toolState, emailView.source.statePath);
    const issues = resolveState(toolState, issueView.source.statePath);
    if (!Array.isArray(emails) || !Array.isArray(issues)) return [];
    return linkEntities({
      source: emails,
      target: issues,
      sourceField: "subject",
      targetField: "title",
    });
  }, [toolState, systemSpec]);

  const stepHeatmap = React.useMemo(() => {
    const entries: Array<{ id: string; fails: number; avgDurationMs: number; runs: number }> = [];
    const map = new Map<string, { fails: number; totalDuration: number; runs: number }>();
    for (const run of runs) {
      const logs = Array.isArray(run.logs) ? run.logs : [];
      for (const log of logs) {
        const actionId = log.actionId ?? log.id;
        if (!actionId) continue;
        const entry = map.get(actionId) ?? { fails: 0, totalDuration: 0, runs: 0 };
        entry.runs += 1;
        if (log.status === "failed") entry.fails += 1;
        if (typeof log.durationMs === "number") entry.totalDuration += log.durationMs;
        map.set(actionId, entry);
      }
    }
    for (const [id, stats] of map.entries()) {
      const avgDurationMs = stats.runs > 0 ? Math.round(stats.totalDuration / stats.runs) : 0;
      entries.push({ id, fails: stats.fails, avgDurationMs, runs: stats.runs });
    }
    return entries.sort((a, b) => b.fails - a.fails || b.avgDurationMs - a.avgDurationMs).slice(0, 8);
  }, [runs]);
  const runTimeline = React.useMemo(
    () => buildRunTimeline(runDetails?.logs, systemSpec),
    [runDetails, systemSpec],
  );
  const activeLog = React.useMemo(() => {
    if (!Array.isArray(runDetails?.logs)) return null;
    return runDetails.logs[scrubIndex] ?? null;
  }, [runDetails, scrubIndex]);

  React.useEffect(() => {
    if (!activeView || !actionSpecs.length) return;
    if (rows.length > 0) return;
    if (autoFetchedRef.current === activeView.id) return;
    autoFetchedRef.current = activeView.id;
    const firstAction = actionSpecs[0];
    const loadInput = buildLoadInput(firstAction.capabilityId, 5);
    void runAction(firstAction.id, loadInput);
  }, [activeView, actionSpecs, rows, runAction]);

  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No tool specification found. Start chatting to build one.
      </div>
    );
  }

  if (!systemSpec) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Unsupported tool specification.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground">Tool Preview</div>
          <div className="text-lg font-semibold">{systemSpec.purpose}</div>
        </div>
        <div className="flex items-center gap-2">
          {systemSpec.entities.length > 0
            ? systemSpec.entities.map((entity) => (
                <button
                  key={entity.name}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    activeEntityId === entity.name
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => {
                    const viewsForEntity = systemSpec.views.filter(
                      (view) => view.source.entity === entity.name,
                    );
                    setActiveEntityId(entity.name);
                    setActiveViewId(viewsForEntity[0]?.id ?? null);
                  }}
                  type="button"
                >
                  {entity.name}
                </button>
              ))
            : systemSpec.views.map((view) => (
                <button
                  key={view.id}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    activeViewId === view.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setActiveViewId(view.id)}
                  type="button"
                >
                  {view.name}
                </button>
              ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {error && <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        {isLoading && <div className="mb-4 text-sm text-muted-foreground">Loading view…</div>}
        {activeView ? (
          <div className="flex gap-6">
            <div className="flex-1">
              {requiresEvidence(activeView.type) && !evidence && (
                <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  Waiting for data evidence before rendering this view.
                </div>
              )}
              {requiresEvidence(activeView.type) && evidence ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-border/60 bg-background px-4 py-3 text-xs text-muted-foreground">
                    Evidence: {evidence.sampleCount} records • Fields: {evidence.sampleFields.slice(0, 6).join(", ") || "none"} • Confidence {evidence.confidenceScore.toFixed(2)} {evidence.confidenceScore < 0.7 ? "• Draft / Needs confirmation" : ""}
                  </div>
                  <ViewSurface view={activeView} projection={projection} onSelectRow={setSelectedRow} />
                </div>
              ) : null}
              {requiresEvidence(activeView.type) && evidence && rows.length === 0 && (
                <div className="mt-4 rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                  Integration connected but returned no results. Refine filters or try a different scope.
                </div>
              )}
            </div>
            {selectedRow && (
              <div className="w-80 shrink-0 rounded-lg border border-border/60 bg-background px-4 py-4 text-sm">
                <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Details</div>
                <div className="space-y-2">
                  {Object.entries(selectedRow).map(([key, value]) => (
                    <div key={key} className="flex items-start justify-between gap-3 border-b border-border/40 pb-2 last:border-b-0">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="text-foreground">{String(value ?? "")}</span>
                    </div>
                  ))}
                </div>
                {links.length > 0 && (
                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Linked automatically</div>
                    <div className="space-y-2 text-xs">
                      {links.slice(0, 5).map((link) => (
                        <div key={`${link.sourceId}-${link.targetId}`} className="flex items-center justify-between">
                          <span className="text-muted-foreground">{link.reason}</span>
                          <span className="text-foreground">{link.confidence.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Unlinked items available — click to associate.</span>
                      <button
                        className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground disabled:opacity-60"
                        type="button"
                        disabled
                      >
                        Associate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No views configured yet.</div>
        )}
      </div>

      <div className="border-t border-border/60 px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            onClick={() => activeViewId && fetchView(activeViewId)}
            type="button"
          >
            Refresh
          </button>
          {actionSpecs.slice(0, 1).map((action) => (
            <button
              key={`${action.id}-load`}
              className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
              onClick={() => runAction(action.id, buildLoadInput(action.capabilityId, 10))}
              type="button"
            >
              Load more
            </button>
          ))}
          {actionSpecs.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onExecute={(input) => runAction(action.id, input)}
              allowWrites={allowWrites}
            />
          ))}
          {!allowWrites && actionSpecs.some((action) => isWriteAction(action)) && (
            <button
              className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
              onClick={() => setAllowWrites(true)}
              type="button"
            >
              Enable write actions
            </button>
          )}
        </div>
      </div>

      {systemSpec.automations && (
        <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
          <div className="mb-2 text-[11px] font-semibold uppercase">Automation Scheduling</div>
          <div className="flex flex-wrap items-center gap-4">
            <div>Auto-ready: {systemSpec.automations.capabilities.canRunWithoutUI ? "yes" : "no"}</div>
            <div>Max frequency: {systemSpec.automations.capabilities.maxFrequency}/day</div>
            <div>Triggers: {systemSpec.automations.capabilities.supportedTriggers.join(", ") || "none"}</div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              className="rounded-md border border-border/60 bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
              onClick={async () => {
                await fetch(`/api/tools/${toolId}/automation`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ paused: !paused }),
                });
                setPaused((prev) => !prev);
              }}
              type="button"
            >
              {paused ? "Resume runs" : "Pause runs"}
            </button>
            <div>{paused ? "Paused by user" : "Runs active"}</div>
          </div>
          {triggersError && (
            <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-700">
              {triggersError}
            </div>
          )}
          <div className="mt-4 space-y-3">
            {triggersLoading ? (
              <div>Loading schedules…</div>
            ) : triggers.filter((t) => t.type === "cron").length === 0 ? (
              <div>No cron triggers configured.</div>
            ) : (
              triggers
                .filter((t) => t.type === "cron")
                .map((trigger) => {
                  const draft = triggerDrafts[trigger.id];
                  const cronValue = draft?.cron ?? trigger.condition?.cron ?? "";
                  const intervalValue = draft?.intervalMinutes ?? trigger.condition?.intervalMinutes ?? 1;
                  const thresholdValue = draft?.failureThreshold ?? trigger.condition?.failureThreshold ?? 0;
                  const enabledValue = draft?.enabled ?? trigger.enabled;
                  return (
                    <div key={trigger.id} className="rounded-md border border-border/60 bg-background px-3 py-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-foreground">{trigger.name}</div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
                            type="button"
                            onClick={() => {
                              void fetch(`/api/tools/${toolId}/triggers/${trigger.id}/run`, { method: "POST" });
                              void fetchRuns();
                            }}
                          >
                            Run now
                          </button>
                          <button
                            className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
                            type="button"
                            onClick={() => saveTrigger(trigger.id)}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                        <label className="flex items-center gap-2">
                          <span>Cron</span>
                          <input
                            className="rounded-md border border-border/60 bg-background px-2 py-1"
                            value={cronValue}
                            onChange={(e) => updateTriggerDraft(trigger.id, { cron: e.target.value })}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span>Every (min)</span>
                          <input
                            className="w-16 rounded-md border border-border/60 bg-background px-2 py-1"
                            type="number"
                            min={1}
                            value={intervalValue}
                            onChange={(e) => updateTriggerDraft(trigger.id, { intervalMinutes: Number(e.target.value) })}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span>Pause after failures</span>
                          <input
                            className="w-16 rounded-md border border-border/60 bg-background px-2 py-1"
                            type="number"
                            min={0}
                            value={thresholdValue}
                            onChange={(e) => updateTriggerDraft(trigger.id, { failureThreshold: Number(e.target.value) })}
                          />
                        </label>
                        <label className="flex items-center gap-2">
                          <span>Enabled</span>
                          <input
                            type="checkbox"
                            checked={enabledValue}
                            onChange={(e) => updateTriggerDraft(trigger.id, { enabled: e.target.checked })}
                          />
                        </label>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                        <span>Next run: {trigger.next_run_at ?? "pending"}</span>
                        <span>Last run: {trigger.last_run_at ?? "never"}</span>
                        <span>Failures: {trigger.failure_count ?? 0}</span>
                        <span>{describeCron(cronValue, intervalValue)}</span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
        <div className="mb-2 text-[11px] font-semibold uppercase">Recent Runs</div>
        {runs.length === 0 ? (
          <div>No runs yet.</div>
        ) : (
          <div className="space-y-1">
            {runs.slice(0, 5).map((run) => (
              <div key={run.id} className="flex items-center justify-between">
                <span>{run.status}</span>
                <div className="flex items-center gap-2">
                  <span>{new Date(run.created_at).toLocaleString()}</span>
                  <button
                    className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
                    type="button"
                    onClick={() => {
                      setSelectedRunId(run.id);
                      setRunInspectorOpen(true);
                    }}
                  >
                    Inspect
                  </button>
                  {run.status === "failed" && (
                    <button
                      className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
                      type="button"
                      onClick={async () => {
                        await fetch(`/api/tools/${toolId}/runs/${run.id}/retry`, { method: "POST" });
                        void fetchRuns();
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
          <span>Total: {runStats.total ?? 0}</span>
          <span>Failed: {runStats.failed ?? 0}</span>
          <span>Blocked: {runStats.blocked ?? 0}</span>
        </div>
      </div>

      <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
        <div className="mb-2 text-[11px] font-semibold uppercase">Budget & Cost</div>
        {budgetLoading ? (
          <div>Loading budget…</div>
        ) : budgetInfo ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4">
              <span>Tokens used: {budgetInfo.usage.tokensUsed}</span>
              <span>Cost estimate: ${budgetInfo.costEstimate.toFixed(4)}</span>
              <span>Projected tokens: {budgetInfo.projectedMonthlyTokens}</span>
              <span>Projected cost: ${budgetInfo.projectedMonthlyCost.toFixed(4)}</span>
            </div>
            {budgetDraft && (
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <span>Monthly cap</span>
                  <input
                    className="w-28 rounded-md border border-border/60 bg-background px-2 py-1"
                    type="number"
                    min={0}
                    value={budgetDraft.monthlyLimit}
                    onChange={(e) =>
                      setBudgetDraft((prev) =>
                        prev ? { ...prev, monthlyLimit: Number(e.target.value) } : prev,
                      )
                    }
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span>Per-run cap</span>
                  <input
                    className="w-28 rounded-md border border-border/60 bg-background px-2 py-1"
                    type="number"
                    min={0}
                    value={budgetDraft.perRunLimit}
                    onChange={(e) =>
                      setBudgetDraft((prev) =>
                        prev ? { ...prev, perRunLimit: Number(e.target.value) } : prev,
                      )
                    }
                  />
                </label>
                <button
                  className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
                  type="button"
                  onClick={() => budgetDraft && saveBudget(budgetDraft)}
                >
                  Save budget
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>No budget data.</div>
        )}
      </div>

      <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
        <div className="mb-2 text-[11px] font-semibold uppercase">Error Heatmap</div>
        <div className="flex gap-2">
          {errorHeatmap.days.map((day) => (
            <div key={day.key} className="flex flex-col items-center gap-1">
              <div
                className="h-6 w-6 rounded-sm"
                style={{
                  backgroundColor: `rgba(248, 113, 113, ${day.count / errorHeatmap.max})`,
                }}
              />
              <span className="text-[10px]">{day.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
        <div className="mb-2 text-[11px] font-semibold uppercase">Step Heatmap</div>
        {stepHeatmap.length === 0 ? (
          <div>No step telemetry yet.</div>
        ) : (
          <div className="space-y-2">
            {stepHeatmap.map((step) => (
              <div key={step.id} className="flex items-center justify-between gap-4 rounded-md border border-border/60 px-3 py-2">
                <div className="text-foreground">{step.id}</div>
                <div className="flex items-center gap-3">
                  <span>Avg: {step.avgDurationMs}ms</span>
                  <span>Fails: {step.fails}</span>
                  <span>Runs: {step.runs}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
        <div className="mb-2 text-[11px] font-semibold uppercase">Integration Health</div>
        <div className="flex flex-wrap gap-3">
          {integrationHealth.map((integration) => (
            <span key={integration.id}>
              {integration.id}: {integration.status}
            </span>
          ))}
        </div>
      </div>
      <Dialog open={runInspectorOpen} onOpenChange={setRunInspectorOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Run Inspector</DialogTitle>
          </DialogHeader>
          {runDetailsLoading ? (
            <div className="text-sm text-muted-foreground">Loading run…</div>
          ) : !runDetails ? (
            <div className="text-sm text-muted-foreground">Select a run to inspect.</div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
              <div className="flex flex-col gap-4">
                <ExecutionTimeline steps={runTimeline} />
                <div className="flex flex-col gap-2 rounded-md border border-border/60 p-3 text-xs">
                  <div className="text-muted-foreground">Timeline scrubber</div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, runTimeline.length - 1)}
                    value={Math.min(scrubIndex, Math.max(0, runTimeline.length - 1))}
                    onChange={(e) => setScrubIndex(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex h-full flex-col gap-3 rounded-md border border-border/60 p-4 text-xs">
                <div className="text-sm font-medium text-foreground">Step Details</div>
                {activeLog ? (
                  <div className="space-y-3">
                    <DetailRow label="Action" value={resolveActionLabel(activeLog, systemSpec)} />
                    <DetailRow label="Integration" value={activeLog.integrationId ?? "unknown"} />
                    <DetailRow label="Duration" value={activeLog.durationMs ? `${activeLog.durationMs}ms` : "n/a"} />
                    <DetailRow label="Retries" value={String(activeLog.retries ?? 0)} />
                    <DetailRow label="Status" value={String(activeLog.status ?? "unknown")} />
                    {activeLog.error && <DetailRow label="Failure" value={String(activeLog.error)} />}
                    <div className="rounded-md border border-border/60 p-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Inputs</div>
                      <StructuredPreview value={activeLog.input} />
                    </div>
                    <div className="rounded-md border border-border/60 p-3">
                      <div className="mb-2 text-[11px] font-semibold uppercase text-muted-foreground">Outputs</div>
                      <StructuredPreview value={activeLog.output} />
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No step selected.</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewSurface({
  view,
  projection,
  onSelectRow,
}: {
  view: ViewSpec;
  projection: ViewProjection | null;
  onSelectRow: (row: Record<string, any> | null) => void;
}) {
  const data = projection?.data ?? null;
  if (view.type === "kanban") {
    return <KanbanView view={view} data={data} onSelectRow={onSelectRow} />;
  }
  if (view.type === "table") {
    return <TableView view={view} data={data} onSelectRow={onSelectRow} />;
  }
  if (view.type === "timeline") {
    return <TimelineView data={data} onSelectRow={onSelectRow} />;
  }
  if (view.type === "chat") {
    return <ChatView data={data} />;
  }
  if (view.type === "form") {
    return <FormView />;
  }
  if (view.type === "inspector") {
    return <InspectorView data={data} />;
  }
  if (view.type === "command") {
    return <CommandView />;
  }
  return <div className="text-sm text-muted-foreground">View not supported yet.</div>;
}

function TableView({
  view,
  data,
  onSelectRow,
}: {
  view: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const columns = view.fields.length > 0 ? view.fields : rows[0] ? Object.keys(rows[0]) : [];

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No records yet.</div>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="min-w-full divide-y divide-border/60 text-sm">
        <thead className="bg-muted/40">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-2 text-left font-medium text-muted-foreground">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60 bg-background">
          {rows.slice(0, 20).map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="cursor-pointer hover:bg-muted/30"
              onClick={() => onSelectRow(row as Record<string, any>)}
            >
              {columns.map((column) => (
                <td key={`${rowIndex}-${column}`} className="px-4 py-2 text-foreground">
                  {String(row?.[column] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KanbanView({
  view,
  data,
  onSelectRow,
}: {
  view: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const statusField = view.fields.find((f) => f.toLowerCase().includes("status")) ?? "status";
  const groups = rows.reduce<Record<string, any[]>>((acc, row) => {
    const key = String(row?.[statusField] ?? "Unassigned");
    acc[key] = acc[key] ?? [];
    acc[key].push(row);
    return acc;
  }, {});

  const columns = Object.keys(groups);
  if (columns.length === 0) {
    return <div className="text-sm text-muted-foreground">No cards yet.</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {columns.map((column) => (
        <div key={column} className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">{column}</div>
          <div className="space-y-2">
            {groups[column].map((row, idx) => (
              <button
                key={idx}
                className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-left text-sm hover:bg-muted/30"
                onClick={() => onSelectRow(row as Record<string, any>)}
                type="button"
              >
                {String(row?.title ?? row?.name ?? row?.id ?? "Item")}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineView({
  data,
  onSelectRow,
}: {
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No timeline entries yet.</div>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <button
          key={idx}
          className="w-full rounded-md border border-border/60 bg-background px-4 py-3 text-left text-sm hover:bg-muted/30"
          onClick={() => onSelectRow(row as Record<string, any>)}
          type="button"
        >
          <div className="font-medium">{String(row?.title ?? row?.name ?? "Event")}</div>
          <div className="text-xs text-muted-foreground">{String(row?.date ?? row?.timestamp ?? "")}</div>
        </button>
      ))}
    </div>
  );
}

function ChatView({ data }: { data: any }) {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground">No conversation yet.</div>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row, idx) => (
        <div key={idx} className="rounded-md border border-border/60 bg-muted/30 px-4 py-3 text-sm">
          <div className="text-xs text-muted-foreground">{String(row?.author ?? "User")}</div>
          <div>{String(row?.text ?? row?.message ?? "")}</div>
        </div>
      ))}
    </div>
  );
}

function FormView() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
      Form view ready. Add inputs via actions.
    </div>
  );
}

function InspectorView({ data }: { data: any }) {
  if (!data) {
    return <div className="text-sm text-muted-foreground">No item selected.</div>;
  }
  const entries = Object.entries(data as Record<string, any>);
  return (
    <div className="rounded-lg border border-border/60 bg-background px-4 py-4 text-sm">
      <div className="space-y-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex justify-between gap-4 border-b border-border/40 pb-2 last:border-b-0">
            <span className="text-muted-foreground">{key}</span>
            <span className="text-foreground">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommandView() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
      Command palette ready. Trigger actions from here.
    </div>
  );
}

function buildRunTimeline(logs: any[] | null | undefined, spec: any): TimelineStep[] {
  if (!Array.isArray(logs)) return [];
  return logs.map((log, index) => {
    const status = mapRunStatus(log.status);
    const label = resolveActionLabel(log, spec) || `Step ${index + 1}`;
    const narrative = log.error ? String(log.error) : log.integrationId ? String(log.integrationId) : undefined;
    return {
      id: log.id ?? `${index}`,
      label,
      status,
      narrative,
      resultAvailable: Boolean(log.output),
    };
  });
}

function mapRunStatus(status: string | undefined): TimelineStep["status"] {
  if (status === "done") return "success";
  if (status === "failed") return "error";
  if (status === "running") return "running";
  if (status === "blocked") return "error";
  return "pending";
}

function describeCron(cron: string, intervalMinutes: number) {
  const trimmed = cron.trim();
  if (!trimmed) return `Every ${intervalMinutes} minutes`;
  const match = trimmed.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (match) return `Every ${match[1]} minutes`;
  const hourMatch = trimmed.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
  if (hourMatch) return `Every ${hourMatch[1]} hours`;
  return `Cron: ${trimmed}`;
}

function resolveActionLabel(log: any, spec: any) {
  const actionId = log.actionId ?? log.id;
  if (!actionId || !spec?.actions) return String(actionId ?? "Step");
  const action = spec.actions.find((a: any) => a.id === actionId);
  return action?.name ?? actionId;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function StructuredPreview({ value }: { value: any }) {
  if (value === null || value === undefined) {
    return <div className="text-muted-foreground">n/a</div>;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <div>{String(value)}</div>;
  }
  if (Array.isArray(value)) {
    const sample = value.slice(0, 3);
    return (
      <div className="space-y-2">
        <div className="text-muted-foreground">Items: {value.length}</div>
        {sample.map((item, index) => (
          <StructuredPreview key={index} value={item} />
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return <div className="text-muted-foreground">Empty</div>;
    return (
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <div key={key} className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-b-0">
            <span className="text-muted-foreground">{key}</span>
            <span className="text-foreground">{String(val)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <div className="text-muted-foreground">{String(value)}</div>;
}

function ActionButton({
  action,
  onExecute,
  allowWrites,
}: {
  action: ActionSpec;
  onExecute: (input?: Record<string, any>) => void;
  allowWrites: boolean;
}) {
  const cap = getCapability(action.capabilityId);
  const isRead = cap?.allowedOperations.includes("read") ?? true;
  const confidence = action.confidence ?? 1;
  const needsConfirmation = confidence < 0.7;
  const disabled = !isRead && (!allowWrites || needsConfirmation);
  const label = needsConfirmation ? `${action.name} · Draft` : action.name;
  return (
    <button
      className="rounded-md border border-border/60 bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => onExecute(action.requiresApproval ? { approved: true } : undefined)}
      type="button"
      disabled={disabled}
    >
      {label}
    </button>
  );
}

function requiresEvidence(type: ViewSpec["type"]) {
  return type === "table" || type === "kanban" || type === "timeline";
}

function isWriteAction(action: ActionSpec) {
  const cap = getCapability(action.capabilityId);
  const isRead = cap?.allowedOperations.includes("read") ?? true;
  return !isRead;
}

function resolveState(state: Record<string, any>, path: string) {
  const parts = path.split(".");
  let current: any = state;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}

function normalizeRows(view: ViewSpec | undefined, data: any) {
  if (!view) return [];
  if (Array.isArray(data)) return data;
  if (data) return [data];
  return [];
}

function buildLoadInput(capabilityId: string, limit: number) {
  const cap = getCapability(capabilityId);
  if (!cap) return { limit };
  const input: Record<string, any> = {};
  if (cap.supportedFields.includes("maxResults")) input.maxResults = limit;
  if (cap.supportedFields.includes("pageSize")) input.pageSize = limit;
  if (cap.supportedFields.includes("first")) input.first = limit;
  if (cap.supportedFields.includes("limit")) input.limit = limit;
  return input;
}
