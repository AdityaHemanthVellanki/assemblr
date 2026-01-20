"use client";

import * as React from "react";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import { isToolSystemSpec, type ViewSpec, type ActionSpec } from "@/lib/toolos/spec";
import { getCapability } from "@/lib/capabilities/registry";
import { linkEntities } from "@/lib/toolos/linking-engine";

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

export function ToolRenderer({ toolId, spec }: { toolId: string; spec: ToolSpec | null }) {
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
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

  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec)) return;
    if (!activeViewId && spec.views.length > 0) {
      setActiveViewId(spec.views[0].id);
    }
  }, [spec, activeViewId]);

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

  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec) || !activeViewId) return;
    void fetchView(activeViewId);
  }, [spec, activeViewId, fetchView]);

  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec)) return;
    void fetchRuns();
    void fetchAutomation();
  }, [spec, fetchRuns, fetchAutomation]);

  const systemSpec = spec && isToolSystemSpec(spec) ? spec : null;
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
          {systemSpec.views.map((view) => (
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

      {systemSpec.automationCapabilities && (
        <div className="border-t border-border/60 px-6 py-4 text-xs text-muted-foreground">
          <div className="mb-2 text-[11px] font-semibold uppercase">Automation</div>
          <div className="flex flex-wrap gap-4">
            <div>Auto-ready: {systemSpec.automationCapabilities.canRunWithoutUI ? "yes" : "no"}</div>
            <div>Max frequency: {systemSpec.automationCapabilities.maxFrequency}/day</div>
            <div>Triggers: {systemSpec.automationCapabilities.supportedTriggers.join(", ") || "none"}</div>
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
                <span>{new Date(run.created_at).toLocaleString()}</span>
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
        <div className="mb-2 text-[11px] font-semibold uppercase">Integration Health</div>
        <div className="flex flex-wrap gap-3">
          {integrationHealth.map((integration) => (
            <span key={integration.id}>
              {integration.id}: {integration.status}
            </span>
          ))}
        </div>
      </div>
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
