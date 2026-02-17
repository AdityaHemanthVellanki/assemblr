"use client";

import * as React from "react";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { isToolSystemSpec, type ViewSpec, type ActionSpec, type TimelineEvent } from "@/lib/toolos/spec";
import { safeFetch, ApiError } from "@/lib/api/client";
import { RealDashboard } from "@/components/dashboard/real-dashboard";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Download, Filter, RefreshCw, ChevronDown } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────
interface DataEvidence {
  integration: string;
  entity: string;
  sampleCount: number;
  sampleFields: string[];
  fetchedAt: string;
  confidenceScore: number;
}

interface ViewProjection {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
}

// ─── Main Component ─────────────────────────────────────────────────
export function ToolRenderer({
  toolId,
  spec,
  status,
}: {
  toolId: string;
  spec: ToolSpec | null;
  status?: string;
}) {
  // View state
  const [activeViewId, setActiveViewId] = React.useState<string | null>(null);
  const [activeEntityId, setActiveEntityId] = React.useState<string | null>(null);
  const [projection, setProjection] = React.useState<ViewProjection | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedRow, setSelectedRow] = React.useState<Record<string, any> | null>(null);
  const [toolState, setToolState] = React.useState<Record<string, any> | null>(null);
  const [evidenceMap, setEvidenceMap] = React.useState<Record<string, DataEvidence> | null>(null);
  const [allowWrites, setAllowWrites] = React.useState(false);
  const autoFetchedRef = React.useRef<string | null>(null);

  // Result state
  const [resultData, setResultData] = React.useState<any>(null);
  const [resultStatus, setResultStatus] = React.useState<"loading" | "materialized" | "pending" | "empty" | "error">("loading");

  // Lifecycle & polling
  const [lifecycle, setLifecycle] = React.useState<string>("INIT");
  const [materialized, setMaterialized] = React.useState<boolean | null>(null);
  const [authStatus, setAuthStatus] = React.useState<"authenticated" | "unauthenticated" | "unknown">("unknown");
  const [pollingInterval, setPollingInterval] = React.useState<number | null>(1500);
  const [pollCount, setPollCount] = React.useState(0);
  const MAX_POLL_ATTEMPTS = 200;
  const authBackoffRef = React.useRef<number | null>(null);

  const systemSpec = spec && isToolSystemSpec(spec) ? spec : null;
  const activeView = React.useMemo(
    () => systemSpec?.views.find((v) => v.id === activeViewId),
    [systemSpec, activeViewId],
  );
  const actionSpecs = React.useMemo(
    () => (systemSpec ? systemSpec.actions.filter((a) => activeView?.actions.includes(a.id)) : []),
    [systemSpec, activeView],
  );

  // Auto-select first entity/view
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

  // ─── Data Fetching ──────────────────────────────────────────────
  const fetchView = React.useCallback(async (viewId: string) => {
    if (!toolId || materialized === false) {
      setError("Tool not materialized.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const payload = await safeFetch<{
        view: ViewProjection;
        state?: Record<string, any>;
        evidence?: Record<string, DataEvidence>;
      }>(`/api/tools/${toolId}/run/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewId }),
      });

      setProjection(payload.view);
      if (payload.state) setToolState(payload.state);
      if (payload.evidence) setEvidenceMap(payload.evidence);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.status === "blocked") {
        setMaterialized(false);
        setError(err.data?.reason ?? "Tool not materialized");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load view");
      }
    } finally {
      setIsLoading(false);
    }
  }, [toolId, materialized]);

  const runAction = React.useCallback(async (actionId: string, input?: Record<string, any>) => {
    if (!toolId || materialized === false) {
      setError("Tool not materialized.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const payload = await safeFetch<{
        view?: ViewProjection;
        state?: Record<string, any>;
      }>(`/api/tools/${toolId}/run/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionId, viewId: activeViewId, input }),
      });

      if (payload.view) setProjection(payload.view);
      if (payload.state) setToolState(payload.state);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.status === "blocked") {
        setMaterialized(false);
        setError(err.data?.reason ?? "Tool not materialized");
      } else {
        setError(err instanceof Error ? err.message : "Failed to run action");
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeViewId, toolId, materialized]);

  const fetchResult = React.useCallback(async () => {
    if (!toolId) return;
    try {
      const payload = await safeFetch<{
        ok: boolean;
        data: any;
        status: string;
      }>(`/api/tools/${toolId}/result`);

      if (payload.ok) {
        if (payload.data && payload.status === "materialized") {
          setMaterialized(true);
          setLifecycle("ACTIVE");
          setResultData(payload.data);
          setResultStatus("materialized");
          setToolState(payload.data.records_json ?? payload.data);
          setAuthStatus("authenticated");
        } else if (payload.status === "ready_no_data") {
          setMaterialized(true);
          setLifecycle("ACTIVE");
          setResultData(null);
          setResultStatus("empty");
          setAuthStatus("authenticated");
        } else if (payload.status === "error") {
          setResultStatus("error");
          setMaterialized(false);
          const errLog = payload.data?.error_log;
          const errMsg = Array.isArray(errLog) && errLog.length > 0 ? errLog[0].message : "Tool execution failed";
          setError(errMsg);
        } else if (payload.status === "pending") {
          setResultStatus("pending");
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setResultStatus("error");
        setMaterialized(false);
        setError("Tool not found.");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load result");
        setResultStatus("error");
      }
    }
  }, [toolId]);

  const fetchStatus = React.useCallback(async () => {
    if (!toolId) return null;
    try {
      const payload = await safeFetch<{
        status: string | null;
        error: string | null;
        done: boolean;
      }>(`/api/tools/${toolId}/status`);

      if (payload.status === "unauthenticated") {
        setAuthStatus("unauthenticated");
        return "unauthenticated";
      }
      setAuthStatus("authenticated");
      return "authenticated";
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
        setAuthStatus("unauthenticated");
        return "unauthenticated";
      }
      return null;
    }
  }, [toolId]);

  // ─── Effects ──────────────────────────────────────────────────
  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec) || !activeViewId) return;
    if (materialized !== true) return;
    void fetchView(activeViewId);
  }, [spec, activeViewId, fetchView, materialized]);

  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec)) return;
    if (error) return;
    void fetchResult();
  }, [spec, authStatus, fetchResult, error]);

  // Polling for status during generation
  React.useEffect(() => {
    if (!spec || !isToolSystemSpec(spec)) return;
    if (pollingInterval === null) return;
    let cancelled = false;
    let intervalId: number | null = null;

    const poll = async () => {
      if (status === "CREATED" || status === "FAILED" || status === "MATERIALIZED" || status === "READY" || status === "DRAFT" || status === "IDLE") {
        setPollingInterval(null);
        return;
      }
      if (pollCount > MAX_POLL_ATTEMPTS) {
        setPollingInterval(null);
        return;
      }
      await fetchStatus();
      setPollCount(c => c + 1);
      if (cancelled) return;

      // Re-fetch result to see if materialization happened
      await fetchResult();
    };

    void poll();
    intervalId = window.setInterval(poll, pollingInterval);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (authBackoffRef.current) window.clearTimeout(authBackoffRef.current);
    };
  }, [spec, fetchStatus, pollingInterval, status, pollCount, toolId, fetchResult]);

  // Auto-load first action when materialized
  React.useEffect(() => {
    if (!activeView || !actionSpecs.length) return;
    const rows = normalizeRows(activeView, projection?.data);
    if (rows.length > 0) return;
    if (autoFetchedRef.current === activeView.id) return;
    if (materialized !== true) return;
    autoFetchedRef.current = activeView.id;
    const firstAction = actionSpecs[0];
    const loadInput = buildLoadInput(firstAction.capabilityId, 5);
    void runAction(firstAction.id, loadInput);
  }, [activeView, actionSpecs, projection, runAction, materialized]);

  const rows = React.useMemo(
    () => normalizeRows(activeView, projection?.data),
    [activeView, projection?.data],
  );

  // ─── Render: No spec yet (initial canvas) ─────────────────────
  if (!toolId || status === "IDLE" || status === "DRAFT") {
    return <ToolIdleState />;
  }

  if (!spec) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-8 text-center">
        <GeneratingAnimation stage="waiting" />
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

  // ─── Render: Generating / Fetching states ─────────────────────
  // CRITICAL: resultStatus is the authoritative signal. If /result already
  // returned data, we MUST render the tool canvas regardless of the status prop.
  const hasResult = resultStatus === "materialized" || resultStatus === "empty";
  const isGenerating = !hasResult && (status === "CREATED" || status === "DRAFT" || status === "IDLE" || status === "PLANNED" || status === "READY_TO_EXECUTE");
  const isExecuting = !hasResult && status === "EXECUTING";
  const isFailed = status === "FAILED" && !hasResult;

  console.log("[ToolRenderer] Render decision:", { status, resultStatus, hasResult, isGenerating, isExecuting, isFailed, materialized });

  if (isGenerating || isExecuting) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background">
        <GeneratingAnimation
          stage={isExecuting ? "fetching" : "generating"}
          purpose={systemSpec.purpose}
        />
      </div>
    );
  }

  if (isFailed && !activeView) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background p-8 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-16 w-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-red-400">Generation Failed</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {error || "Something went wrong during tool generation. Try rephrasing your prompt."}
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  // ─── Render: Result-Driven UI (MATERIALIZED) ──────────────────
  return (
    <div className="flex h-full flex-col bg-[#09090b] overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between border-b border-white/10 px-6 py-3 bg-[#09090b]/95 backdrop-blur-md sticky top-0 z-20"
      >
        <div className="flex items-center gap-4">
          <div className="bg-primary/20 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">{systemSpec.purpose}</h1>
            <p className="text-xs text-muted-foreground/80">
              {systemSpec.entities.map(e => e.name).join(" · ")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View Tabs */}
          {systemSpec.views.length > 1 && systemSpec.views.map((view) => (
            <button
              key={view.id}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${activeViewId === view.id
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              onClick={() => setActiveViewId(view.id)}
              type="button"
            >
              {view.name}
            </button>
          ))}

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 ml-3 pl-3 border-l border-white/10">
            <button
              className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
              onClick={() => activeViewId && fetchView(activeViewId)}
              type="button"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
            <button
              className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
              type="button"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        </div>
      </motion.div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-red-500/20 bg-red-500/5 px-6 py-2.5 text-sm text-red-400 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {resultStatus === "pending" || resultStatus === "loading" ? (
          <div className="flex items-center justify-center h-full">
            <GeneratingAnimation stage="fetching" purpose={systemSpec.purpose} />
          </div>
        ) : resultStatus === "empty" ? (
          <EmptyDataState />
        ) : activeView ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            <div className="flex h-full">
              <div className="flex-1 overflow-auto p-6">
                {isLoading && (
                  <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    Loading data…
                  </div>
                )}
                <ViewSurface
                  view={activeView}
                  projection={projection}
                  onSelectRow={setSelectedRow}
                />
                {rows.length === 0 && !isLoading && materialized && (
                  <EmptyDataState />
                )}
              </div>

              {/* Detail Sidebar */}
              <AnimatePresence>
                {selectedRow && (
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="w-80 shrink-0 border-l border-white/10 bg-[#0a0a0c] overflow-auto"
                  >
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Details</span>
                        <button
                          onClick={() => setSelectedRow(null)}
                          className="text-muted-foreground hover:text-foreground text-xs"
                          type="button"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="space-y-2.5">
                        {Object.entries(selectedRow).map(([key, value]) => (
                          <div key={key} className="flex flex-col gap-0.5 border-b border-white/5 pb-2.5 last:border-b-0">
                            <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">{key}</span>
                            <span className="text-sm text-foreground break-all">{String(value ?? "—")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <EmptyDataState />
          </div>
        )}
      </div>

      {/* Bottom Action Bar — only show when materialized with actions */}
      {materialized && actionSpecs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-white/10 px-6 py-3 bg-[#09090b]/95 backdrop-blur-md"
        >
          <div className="flex items-center gap-2">
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
                className="h-8 px-3 rounded-lg border border-white/10 bg-white/5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
                onClick={() => setAllowWrites(true)}
                type="button"
              >
                Enable write actions
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ─── Generating Animation ───────────────────────────────────────────
function GeneratingAnimation({ stage, purpose }: { stage: "waiting" | "generating" | "fetching"; purpose?: string }) {
  const messages = {
    waiting: {
      title: "Describe what you want to build",
      subtitle: "The canvas is ready for your vision. Use the chat to define your tool.",
    },
    generating: {
      title: "Generating your tool…",
      subtitle: purpose || "Building the perfect interface for your request",
    },
    fetching: {
      title: "Fetching live data…",
      subtitle: "Connecting to integrations and materializing your dataset",
    },
  };

  const { title, subtitle } = messages[stage];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 max-w-md text-center"
    >
      {/* Animated orb */}
      <div className="relative">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -inset-6 rounded-full bg-primary/10 blur-2xl"
        />
        <motion.div
          animate={stage !== "waiting" ? {
            rotate: 360,
          } : undefined}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center"
        >
          <Sparkles className={`h-8 w-8 text-primary/70 ${stage !== "waiting" ? "animate-pulse" : ""}`} />
        </motion.div>
      </div>

      <div className="space-y-2">
        <motion.h3
          key={title}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
        >
          {title}
        </motion.h3>
        <motion.p
          key={subtitle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-sm text-muted-foreground max-w-sm leading-relaxed"
        >
          {subtitle}
        </motion.p>
      </div>

      {stage !== "waiting" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-1.5"
        >
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
              className="h-1.5 w-1.5 rounded-full bg-primary"
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ─── Empty Data State ───────────────────────────────────────────────
function EmptyDataState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center"
    >
      <div className="h-14 w-14 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <AlertTriangle className="h-7 w-7 text-amber-400" />
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">No data found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          No results for the current configuration. Try adjusting the date range, filters, or integration scope.
        </p>
      </div>
      <div className="flex gap-2 mt-2">
        <button className="h-8 px-4 rounded-lg border border-white/10 bg-white/5 text-xs font-medium text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors flex items-center gap-1.5" type="button">
          <Filter className="w-3.5 h-3.5" />
          Change filters
        </button>
      </div>
    </motion.div>
  );
}

// ─── View Surface ───────────────────────────────────────────────────
function ViewSurface({
  view,
  projection,
  onSelectRow,
}: {
  view: ViewSpec;
  projection: ViewProjection | null;
  onSelectRow: (row: Record<string, any> | null) => void;
}) {
  const data = projection?.data;
  switch (view.type) {
    case "table":
      return <TableView view={view} data={data} onSelectRow={onSelectRow} />;
    case "kanban":
      return <KanbanView view={view} data={data} onSelectRow={onSelectRow} />;
    case "timeline":
      return <TimelineView data={data} onSelectRow={onSelectRow} />;
    case "detail":
      return <DetailView data={data} />;
    case "chat":
      return <ChatView data={data} />;
    default:
      return <TableView view={view} data={data} onSelectRow={onSelectRow} />;
  }
}

// ─── Table View ─────────────────────────────────────────────────────
function TableView({
  view,
  data,
  onSelectRow,
}: {
  view: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const rows = normalizeRows(view, data);
  const columns = view.fields?.length > 0 ? view.fields : rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="rounded-lg border border-white/5 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            {columns.map((col) => (
              <th key={col} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <motion.tr
              key={i}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
              onClick={() => onSelectRow(row)}
            >
              {columns.map((col) => (
                <td key={col} className="px-4 py-3 text-foreground/90 max-w-[300px] truncate">
                  {String(row[col] ?? "—")}
                </td>
              ))}
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Kanban View ────────────────────────────────────────────────────
function KanbanView({
  view,
  data,
  onSelectRow,
}: {
  view: ViewSpec;
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const rows = normalizeRows(view, data);
  const groupField = view.fields?.[0] ?? "status";
  const groups: Record<string, any[]> = {};
  for (const row of rows) {
    const key = String(row[groupField] ?? "Other");
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} className="w-72 shrink-0 rounded-lg border border-white/5 bg-white/[0.02]">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
            <span className="text-[10px] font-medium text-muted-foreground/60 bg-white/5 rounded-full px-2 py-0.5">{items.length}</span>
          </div>
          <div className="p-2 space-y-2">
            {items.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-md border border-white/5 bg-white/[0.03] p-3 cursor-pointer hover:bg-white/[0.06] transition-colors"
                onClick={() => onSelectRow(item)}
              >
                <div className="text-sm font-medium text-foreground/90 line-clamp-2">
                  {String(item[view.fields?.[1] ?? "title"] ?? item[Object.keys(item)[1]] ?? "—")}
                </div>
                {view.fields?.[2] && (
                  <div className="mt-1 text-xs text-muted-foreground/60 line-clamp-1">
                    {String(item[view.fields[2]] ?? "")}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Timeline View ──────────────────────────────────────────────────
function TimelineView({
  data,
  onSelectRow,
}: {
  data: any;
  onSelectRow: (row: Record<string, any>) => void;
}) {
  const rows = Array.isArray(data) ? data : [];

  return (
    <div className="space-y-3">
      {rows.map((event, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flex gap-4 rounded-lg border border-white/5 bg-white/[0.02] p-4 cursor-pointer hover:bg-white/[0.04] transition-colors"
          onClick={() => onSelectRow(event)}
        >
          <div className="flex flex-col items-center">
            <div className="h-3 w-3 rounded-full bg-primary/40 border-2 border-primary" />
            {i < rows.length - 1 && <div className="flex-1 w-px bg-white/10 mt-1" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-foreground/90">{event.title || event.name || event.message || "Event"}</div>
            <div className="text-xs text-muted-foreground/60 mt-0.5">{event.timestamp || event.date || event.created_at || ""}</div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Detail View ────────────────────────────────────────────────────
function DetailView({ data }: { data: any }) {
  if (!data) return <div className="text-sm text-muted-foreground p-4">No data available.</div>;
  return (
    <div className="space-y-3 p-4">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex flex-col gap-0.5 border-b border-white/5 pb-3">
          <span className="text-[11px] text-muted-foreground/60 uppercase tracking-wider">{key}</span>
          <span className="text-sm text-foreground">{String(value ?? "—")}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Chat View ──────────────────────────────────────────────────────
function ChatView({ data }: { data: any }) {
  const messages = Array.isArray(data) ? data : [];
  return (
    <div className="space-y-3 p-4">
      {messages.map((msg, i) => (
        <div key={i} className={`rounded-lg p-3 text-sm ${msg.role === "user" ? "bg-primary/10 ml-12" : "bg-white/[0.03] mr-12"}`}>
          {msg.content || String(msg)}
        </div>
      ))}
    </div>
  );
}

// ─── Action Button ──────────────────────────────────────────────────
function ActionButton({
  action,
  onExecute,
  allowWrites,
}: {
  action: ActionSpec;
  onExecute: (input?: Record<string, any>) => void;
  allowWrites: boolean;
}) {
  const disabled = isWriteAction(action) && !allowWrites;
  return (
    <button
      className={`h-8 px-3 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${disabled
        ? "border-white/5 text-muted-foreground/40 cursor-not-allowed"
        : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
        }`}
      onClick={() => !disabled && onExecute()}
      title={action.description}
      disabled={disabled}
      type="button"
    >
      {action.name}
    </button>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────
function isWriteAction(action: ActionSpec) {
  const writeVerbs = ["create", "update", "delete", "send", "write", "post", "patch", "remove"];
  const label = (action.name ?? "").toLowerCase();
  return writeVerbs.some((verb) => label.includes(verb));
}

function normalizeRows(view: ViewSpec | undefined, data: any): Record<string, any>[] {
  if (Array.isArray(data)) return data;
  if (view?.source?.statePath && data?.[view.source.statePath]) return data[view.source.statePath];
  if (data && typeof data === "object") return Object.values(data).find(Array.isArray) as any[] ?? [];
  return [];
}

function buildLoadInput(capabilityId: string, limit: number) {
  return {
    capability: capabilityId,
    params: { limit },
  };
}

// ─── Tool Idle State ────────────────────────────────────────────────
function ToolIdleState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center text-muted-foreground/40">
      <Sparkles className="h-12 w-12 opacity-10" />
      <p className="text-sm font-medium">Tool preview will appear here</p>
    </div>
  );
}
