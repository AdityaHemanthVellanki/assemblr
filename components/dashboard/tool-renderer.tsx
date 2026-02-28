"use client";

import * as React from "react";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { isToolSystemSpec, type ViewSpec, type ActionSpec, type TimelineEvent } from "@/lib/toolos/spec";
import { safeFetch, ApiError } from "@/lib/api/client";
import { RealDashboard } from "@/components/dashboard/real-dashboard";
import { WorkflowView } from "@/components/dashboard/workflow-view";
import { ExecutionLog } from "@/components/dashboard/execution-log";
import { TriggerPanel } from "@/components/dashboard/trigger-panel";
import { HealthDashboard } from "@/components/dashboard/health-dashboard";
import { motion, AnimatePresence } from "framer-motion";
import {
  InteractiveTableView,
  InteractiveKanbanView,
  InteractiveTimelineView,
  InteractiveDetailView,
  InteractiveChatView,
  InteractiveFormView,
  InteractiveInspectorView,
  InteractiveCommandView,
  InteractiveDashboardView,
  RichDetailSidebar,
} from "@/components/dashboard/interactive-views";
import {
  Sparkles, AlertTriangle, Download, Filter, RefreshCw, ChevronDown, GitBranch, Play, Zap, Activity, FileJson, Search,
  Send, Edit3, Trash2, Eye, Bell, RotateCw, Plus, Upload, Lock, X, CheckCircle2, Loader2, Circle,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────
interface DataEvidence {
  integration: string;
  entity: string;
  sampleCount: number;
  sampleFields: string[];
  fetchedAt: string;
  confidenceScore: number;
}

interface KpiMetric {
  label: string;
  value: string | number;
  type: "count" | "percentage" | "currency" | "text";
  trend?: "up" | "down" | "neutral";
  color?: "green" | "red" | "amber" | "blue" | "neutral";
}

interface DataInsightsInfo {
  kpis: KpiMetric[];
  summary: string;
  dataQuality: {
    totalRecords: number;
    populatedFields: number;
    totalFields: number;
    completeness: number;
  };
  fieldMeta: Record<string, {
    displayName: string;
    type: string;
    nullCount: number;
    uniqueCount: number;
  }>;
}

interface ViewProjection {
  id: string;
  name: string;
  type: ViewSpec["type"];
  data: any;
  actions: string[];
  insights?: DataInsightsInfo;
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
  const [activeTab, setActiveTab] = React.useState<"data" | "workflows" | "runs" | "triggers" | "health">("data");
  const [warnings, setWarnings] = React.useState<Array<{ id: string; message: string; timestamp: number }>>([]);
  const [buildSteps, setBuildSteps] = React.useState<Array<{ id: string; title: string; status: string; logs: string[] }>>([]);
  const [buildLogs, setBuildLogs] = React.useState<string[]>([]);
  const [lifecycleState, setLifecycleState] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<{
    actionId: string;
    actionName: string;
    actionType: string;
    description: string;
    input: Record<string, any>;
  } | null>(null);
  const autoFetchedRef = React.useRef<string | null>(null);

  // Non-blocking warning system — auto-dismiss after 8s
  const addWarning = React.useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setWarnings((prev) => [...prev.slice(-4), { id, message, timestamp: Date.now() }]);
    setTimeout(() => {
      setWarnings((prev) => prev.filter((w) => w.id !== id));
    }, 8000);
  }, []);

  const dismissWarning = React.useCallback((id: string) => {
    setWarnings((prev) => prev.filter((w) => w.id !== id));
  }, []);

  // Result state
  const [resultData, setResultData] = React.useState<any>(null);
  const [resultStatus, setResultStatus] = React.useState<"loading" | "materialized" | "pending" | "empty" | "error">("loading");

  // Lifecycle & polling
  const [lifecycle, setLifecycle] = React.useState<string>("INIT");
  const [materialized, setMaterialized] = React.useState<boolean | null>(null);
  const [authStatus, setAuthStatus] = React.useState<"authenticated" | "unauthenticated" | "unknown">("unknown");
  const [pollingInterval, setPollingInterval] = React.useState<number | null>(2000);
  const [pollCount, setPollCount] = React.useState(0);
  const MAX_POLL_ATTEMPTS = 60;
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
        // Non-blocking: action failures become warnings, tool keeps rendering
        addWarning(err instanceof Error ? err.message : "Failed to load view");
      }
    } finally {
      setIsLoading(false);
    }
  }, [toolId, materialized, addWarning]);

  const runAction = React.useCallback(async (actionId: string, input?: Record<string, any>, forceAllow?: boolean) => {
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
        status?: string;
        actionId?: string;
        actionName?: string;
        actionType?: string;
        description?: string;
        output?: any;
      }>(`/api/tools/${toolId}/run/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionId,
          viewId: activeViewId,
          input,
          allowWrites: allowWrites || forceAllow,
        }),
      });

      // Handle write action approval gate
      if (payload.status === "requires_approval") {
        setPendingAction({
          actionId: payload.actionId ?? actionId,
          actionName: payload.actionName ?? actionId,
          actionType: payload.actionType ?? "WRITE",
          description: payload.description ?? "",
          input: input ?? {},
        });
        return;
      }

      if (payload.view) setProjection(payload.view);
      if (payload.state) setToolState(payload.state);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.status === "blocked") {
        setMaterialized(false);
        setError(err.data?.reason ?? "Tool not materialized");
      } else {
        // Non-blocking: action failures become warnings, tool keeps rendering
        addWarning(err instanceof Error ? err.message : "Failed to run action");
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeViewId, toolId, materialized, allowWrites, addWarning]);

  const approveAction = React.useCallback(async () => {
    if (!pendingAction) return;
    setPendingAction(null);
    await runAction(pendingAction.actionId, pendingAction.input, true);
  }, [pendingAction, runAction]);

  const dismissAction = React.useCallback(() => {
    setPendingAction(null);
  }, []);

  const fetchResult = React.useCallback(async () => {
    if (!toolId) return;
    try {
      const payload = await safeFetch<{
        ok: boolean;
        data: any;
        status: string;
        build_steps?: Array<{ id: string; title: string; status: string; logs: string[] }>;
      }>(`/api/tools/${toolId}/result`);

      if (payload.ok) {
        if (payload.data && payload.status === "materialized") {
          setMaterialized(true);
          setLifecycle("ACTIVE");
          setResultData(payload.data);
          setResultStatus("materialized");
          setToolState(payload.data.records_json ?? payload.data);
          setAuthStatus("authenticated");
          setBuildSteps([]);
        } else if (payload.status === "ready_no_data") {
          setMaterialized(true);
          setLifecycle("ACTIVE");
          setResultData(null);
          setResultStatus("empty");
          setAuthStatus("authenticated");
          setBuildSteps([]);
        } else if (payload.status === "error") {
          setResultStatus("error");
          setMaterialized(false);
          const errLog = payload.data?.error_log;
          const errMsg = Array.isArray(errLog) && errLog.length > 0 ? errLog[0].message : "Tool execution failed";
          setError(errMsg);
        } else if (payload.status === "pending") {
          setResultStatus("pending");
          // Capture build steps for progress display
          if (Array.isArray(payload.build_steps) && payload.build_steps.length > 0) {
            setBuildSteps(payload.build_steps);
          }
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
        lifecycle_state?: string | null;
        build_logs?: string[] | null;
      }>(`/api/tools/${toolId}/status`);

      if (payload.status === "unauthenticated") {
        setAuthStatus("unauthenticated");
        return "unauthenticated";
      }
      setAuthStatus("authenticated");

      // Capture progress information
      if (payload.lifecycle_state) {
        setLifecycleState(payload.lifecycle_state);
      }
      if (Array.isArray(payload.build_logs) && payload.build_logs.length > 0) {
        setBuildLogs(payload.build_logs);
      }

      // When done, fetch the full result once and stop polling
      if (payload.done) {
        setPollingInterval(null);
        void fetchResult();
      }

      return "authenticated";
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 429)) {
        setAuthStatus("unauthenticated");
        return "unauthenticated";
      }
      return null;
    }
  }, [toolId, fetchResult]);

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
  }, [spec, status, authStatus, fetchResult, error]);

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
      const authResult = await fetchStatus();
      setPollCount(c => c + 1);
      if (cancelled) return;

      // Only fetch the heavy result payload when status indicates completion.
      // During building, the lightweight /status endpoint provides progress info.
      if (status === "MATERIALIZED" || status === "READY" || status === "FAILED") {
        await fetchResult();
      }

      // Exponential backoff: 2s → 3s → 5s → 8s (capped)
      if (pollCount > 20) {
        setPollingInterval(8000);
      } else if (pollCount > 10) {
        setPollingInterval(5000);
      } else if (pollCount > 5) {
        setPollingInterval(3000);
      }
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

  // Show progress animation when pipeline is running but spec hasn't arrived yet
  if (!spec && (status === "EXECUTING" || status === "PLANNED" || status === "READY_TO_EXECUTE" || status === "CREATED")) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-background">
        <GeneratingAnimation stage="generating" />
      </div>
    );
  }

  // Show failure when pipeline failed before producing a spec
  if (!spec && status === "FAILED") {
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
          buildSteps={buildSteps}
          buildLogs={buildLogs}
          lifecycleState={lifecycleState}
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
      {/* Write Action Confirmation Dialog */}
      <AnimatePresence>
        {pendingAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={dismissAction}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md mx-4 bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 pt-6 pb-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Confirm Action</h3>
                    <p className="text-xs text-muted-foreground">{pendingAction.actionType} action requires approval</p>
                  </div>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-4">
                  <p className="text-sm font-medium text-white mb-1">{pendingAction.actionName}</p>
                  <p className="text-xs text-muted-foreground">{pendingAction.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-6 pb-6">
                <button
                  className="flex-1 h-9 rounded-lg text-sm font-medium bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
                  onClick={dismissAction}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="flex-1 h-9 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  onClick={approveAction}
                  type="button"
                >
                  Approve & Execute
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <h1 className="text-lg font-bold tracking-tight text-white">{systemSpec.name !== "Tool" ? systemSpec.name : systemSpec.purpose}</h1>
            <p className="text-xs text-muted-foreground/80">
              {systemSpec.purpose !== systemSpec.name ? systemSpec.purpose : systemSpec.entities.map(e => e.name).join(" · ")}
            </p>
          </div>
        </div>

        {activeTab === "data" && (
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
                onClick={() => {
                  if (!projection?.data) return;
                  const rows = Array.isArray(projection.data) ? projection.data : [projection.data];
                  if (rows.length === 0) return;
                  const headers = Object.keys(rows[0]);
                  const csv = [
                    headers.join(","),
                    ...rows.map((r) => headers.map((h) => {
                      const val = String(r[h] ?? "");
                      return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val.replace(/"/g, '""')}"` : val;
                    }).join(",")),
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${systemSpec.purpose.replace(/\s+/g, "_").toLowerCase()}_export.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                type="button"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
                onClick={() => {
                  if (!projection?.data) return;
                  const json = JSON.stringify(projection.data, null, 2);
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${systemSpec.purpose.replace(/\s+/g, "_").toLowerCase()}_export.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                type="button"
              >
                <FileJson className="w-3.5 h-3.5" />
                JSON
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Section Tabs */}
      {materialized && (
        <div className="flex items-center gap-1 px-6 py-2 border-b border-white/10 bg-[#09090b]/90">
          {[
            { key: "data" as const, label: "Data", icon: <Sparkles className="w-3.5 h-3.5" /> },
            ...((systemSpec.workflows?.length ?? 0) > 0
              ? [{ key: "workflows" as const, label: "Workflows", icon: <GitBranch className="w-3.5 h-3.5" /> }]
              : []),
            { key: "runs" as const, label: "Runs", icon: <Play className="w-3.5 h-3.5" /> },
            ...((systemSpec.triggers?.length ?? 0) > 0
              ? [{ key: "triggers" as const, label: "Triggers", icon: <Zap className="w-3.5 h-3.5" /> }]
              : []),
            { key: "health" as const, label: "Health", icon: <Activity className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-white/10 text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Blocking Error Banner — only for critical errors (auth, tool not found) */}
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

      {/* Non-blocking Warnings — auto-dismiss, action failures etc. */}
      <AnimatePresence>
        {warnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-b border-amber-500/20 bg-amber-500/5 px-6 py-2 space-y-1"
          >
            {warnings.map((w) => (
              <div key={w.id} className="flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">{w.message}</span>
                <button
                  onClick={() => dismissWarning(w.id)}
                  className="shrink-0 text-amber-400/50 hover:text-amber-400 transition-colors"
                  type="button"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool Context Bar — KPIs + data summary when data is visible */}
      {activeTab === "data" && materialized && rows.length > 0 && (
        <>
          {/* KPI Strip */}
          {projection?.insights?.kpis && projection.insights.kpis.length > 0 && (
            <div className="flex items-stretch gap-3 px-6 py-3 border-b border-white/5 bg-[#09090b]/90 overflow-x-auto scrollbar-none">
              {projection.insights.kpis.map((kpi, i) => {
                const colorMap: Record<string, string> = {
                  green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                  red: "text-red-400 bg-red-500/10 border-red-500/20",
                  amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
                  blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
                  neutral: "text-muted-foreground bg-white/5 border-white/10",
                };
                const style = colorMap[kpi.color ?? "neutral"] ?? colorMap.neutral;
                return (
                  <motion.div
                    key={kpi.label}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex flex-col gap-0.5 px-4 py-2 rounded-xl border ${style} min-w-[120px]`}
                  >
                    <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{kpi.label}</span>
                    <span className="text-lg font-bold tabular-nums">{kpi.value}</span>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Data Summary + Stats Strip */}
          <div className="flex items-center gap-4 px-6 py-1.5 border-b border-white/5 bg-[#09090b]/80 text-[10px] text-muted-foreground/50">
            {projection?.insights?.summary ? (
              <span className="text-muted-foreground/70">{projection.insights.summary}</span>
            ) : (
              <>
                <span className="tabular-nums">{rows.length} records</span>
                <span className="text-white/10">|</span>
                <span>{systemSpec.integrations.map((i) => i.id).join(", ")}</span>
              </>
            )}
            <span className="ml-auto flex items-center gap-3">
              <span>{systemSpec.views.length} view{systemSpec.views.length !== 1 ? "s" : ""}</span>
              <span className="text-white/10">|</span>
              <span>{systemSpec.actions.length} action{systemSpec.actions.length !== 1 ? "s" : ""}</span>
              {projection?.insights?.dataQuality && (
                <>
                  <span className="text-white/10">|</span>
                  <span className={projection.insights.dataQuality.completeness >= 0.8 ? "text-emerald-400/60" : projection.insights.dataQuality.completeness >= 0.5 ? "text-amber-400/60" : "text-red-400/60"}>
                    {Math.round(projection.insights.dataQuality.completeness * 100)}% complete
                  </span>
                </>
              )}
              {resultData?.materialized_at && (
                <>
                  <span className="text-white/10">|</span>
                  <span>Updated {new Date(resultData.materialized_at).toLocaleTimeString()}</span>
                </>
              )}
            </span>
          </div>
        </>
      )}

      {/* Tool Description — shows on first load to help users understand the tool */}
      {activeTab === "data" && materialized && rows.length > 0 && (systemSpec as any).toolDescription && !(systemSpec as any)._descriptionDismissed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-6 py-3 border-b border-primary/10 bg-primary/5"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-primary/80 leading-relaxed flex-1">{(systemSpec as any).toolDescription}</p>
          </div>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "data" ? (
          /* ── Data Tab ── */
          resultStatus === "pending" || resultStatus === "loading" ? (
            <div className="flex items-center justify-center h-full">
              <GeneratingAnimation
                stage="fetching"
                purpose={systemSpec.purpose}
                buildSteps={buildSteps}
                buildLogs={buildLogs}
                lifecycleState={lifecycleState}
              />
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
                    <RichDetailSidebar
                      row={selectedRow}
                      onClose={() => setSelectedRow(null)}
                      onAction={(actionId, input) => runAction(actionId, input)}
                      actions={actionSpecs.map((a) => ({ id: a.id, name: a.name }))}
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <EmptyDataState />
            </div>
          )
        ) : activeTab === "workflows" ? (
          /* ── Workflows Tab ── */
          <WorkflowView workflows={systemSpec.workflows ?? []} toolId={toolId} />
        ) : activeTab === "runs" ? (
          /* ── Runs Tab ── */
          <ExecutionLog toolId={toolId} />
        ) : activeTab === "triggers" ? (
          /* ── Triggers Tab ── */
          <TriggerPanel toolId={toolId} />
        ) : activeTab === "health" ? (
          /* ── Health Tab ── */
          <HealthDashboard toolId={toolId} />
        ) : null}
      </div>

      {/* Bottom Action Bar — only show when materialized with actions on data tab */}
      {activeTab === "data" && materialized && actionSpecs.length > 0 && (
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

// ─── Generating Animation with Time-Based Progress ──────────────────
const PIPELINE_STEPS = [
  { id: "understand", title: "Understanding your request", detail: "Analyzing intent and requirements", durationMs: 2000 },
  { id: "integrations", title: "Resolving integrations", detail: "Selecting the best data sources", durationMs: 3000 },
  { id: "entities", title: "Extracting data models", detail: "Identifying entities and relationships", durationMs: 3000 },
  { id: "actions", title: "Defining data operations", detail: "Building query and action plans", durationMs: 3500 },
  { id: "fetch", title: "Fetching live data", detail: "Connecting to APIs and pulling records", durationMs: 6000 },
  { id: "views", title: "Designing views", detail: "Creating the best layout for your data", durationMs: 2500 },
  { id: "finalize", title: "Finalizing tool", detail: "Validating and materializing output", durationMs: 2000 },
];

function GeneratingAnimation({
  stage,
  purpose,
  buildSteps,
  buildLogs,
  lifecycleState,
}: {
  stage: "waiting" | "generating" | "fetching";
  purpose?: string;
  buildSteps?: Array<{ id: string; title: string; status: string; logs: string[] }>;
  buildLogs?: string[];
  lifecycleState?: string | null;
}) {
  const messages = {
    waiting: {
      title: "Describe what you want to build",
      subtitle: "The canvas is ready for your vision. Use the chat to define your tool.",
    },
    generating: {
      title: "Building your tool…",
      subtitle: purpose || "Assembling the perfect interface for your request",
    },
    fetching: {
      title: "Fetching live data…",
      subtitle: "Connecting to integrations and materializing your dataset",
    },
  };

  const { title, subtitle } = messages[stage];
  const hasBuildSteps = buildSteps && buildSteps.length > 0;

  // Time-based progress: track elapsed time since mount to drive step progression
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const mountTimeRef = React.useRef(Date.now());

  React.useEffect(() => {
    if (stage === "waiting") return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - mountTimeRef.current);
    }, 300);
    return () => clearInterval(interval);
  }, [stage]);

  // Compute which step is active based on elapsed time
  const timeSteps = React.useMemo(() => {
    if (stage === "waiting") return [];
    let cumulative = 0;
    return PIPELINE_STEPS.map((step) => {
      const startMs = cumulative;
      cumulative += step.durationMs;
      const endMs = cumulative;
      const isComplete = elapsedMs >= endMs;
      const isActive = !isComplete && elapsedMs >= startMs;
      const isPending = elapsedMs < startMs;
      return { ...step, isComplete, isActive, isPending };
    });
  }, [stage, elapsedMs]);

  // Map server lifecycle state to step index for more accurate progress
  const serverStepIndex = React.useMemo(() => {
    if (!lifecycleState) return -1;
    const mapping: Record<string, number> = {
      UNDERSTANDING: 0,
      ENTITIES_EXTRACTED: 2,
      INTEGRATIONS_RESOLVED: 1,
      ACTIONS_DEFINED: 3,
      WORKFLOWS_COMPILED: 3,
      RUNTIME_READY: 5,
      MATERIALIZED: 6,
    };
    return mapping[lifecycleState] ?? -1;
  }, [lifecycleState]);

  // If server reports a step, override time-based progress to be at least that far
  const displaySteps = React.useMemo(() => {
    if (stage === "waiting" || timeSteps.length === 0) return timeSteps;
    if (serverStepIndex < 0) return timeSteps;
    return timeSteps.map((step, i) => {
      if (i < serverStepIndex) return { ...step, isComplete: true, isActive: false, isPending: false };
      if (i === serverStepIndex) return { ...step, isComplete: false, isActive: true, isPending: false };
      return step;
    });
  }, [timeSteps, serverStepIndex, stage]);

  // Progress percentage
  const completedCount = displaySteps.filter((s) => s.isComplete).length;
  const activeExists = displaySteps.some((s) => s.isActive);
  const progressPct = displaySteps.length > 0
    ? Math.min(95, Math.round(((completedCount + (activeExists ? 0.5 : 0)) / displaySteps.length) * 100))
    : 0;

  // Active step detail text
  const activeDetail = displaySteps.find((s) => s.isActive)?.detail ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center gap-6 max-w-lg text-center px-4"
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
          animate={stage !== "waiting" ? { rotate: 360 } : undefined}
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

      {/* Progress Steps — always visible during generation/fetching */}
      {stage !== "waiting" && displaySteps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm"
        >
          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary"
              />
            </div>
            <span className="text-[10px] text-muted-foreground/50 tabular-nums w-8 text-right">
              {progressPct}%
            </span>
          </div>

          {/* Step list */}
          <div className="space-y-1 text-left">
            {displaySteps.map((step, i) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className={`flex items-center gap-3 px-3 py-1.5 rounded-lg transition-all ${
                  step.isActive ? "bg-primary/5 border border-primary/10" : ""
                }`}
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {step.isComplete ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : step.isActive ? (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-muted-foreground/15" />
                  )}
                </div>

                {/* Step title */}
                <span className={`text-xs font-medium ${
                  step.isComplete
                    ? "text-emerald-400/70"
                    : step.isActive
                    ? "text-white"
                    : "text-muted-foreground/30"
                }`}>
                  {step.title}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Active step detail / log line */}
          <AnimatePresence mode="wait">
            {activeDetail && (
              <motion.div
                key={activeDetail}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-3 text-[11px] text-muted-foreground/40 text-center"
              >
                {activeDetail}
              </motion.div>
            )}
          </AnimatePresence>
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
      return <InteractiveTableView view={view} data={data} onSelectRow={onSelectRow} />;
    case "kanban":
      return <InteractiveKanbanView view={view} data={data} onSelectRow={onSelectRow} />;
    case "timeline":
      return <InteractiveTimelineView view={view} data={data} onSelectRow={onSelectRow} />;
    case "detail":
      return <InteractiveDetailView data={data} />;
    case "chat":
      return <InteractiveChatView data={data} />;
    case "form":
      return <InteractiveFormView view={view} data={data} />;
    case "inspector":
      return <InteractiveInspectorView data={data} onSelectRow={onSelectRow} />;
    case "command":
      return <InteractiveCommandView data={data} />;
    case "dashboard":
      return <InteractiveDashboardView view={view} data={data} onSelectRow={onSelectRow} />;
    default:
      return <InteractiveTableView view={view} data={data} onSelectRow={onSelectRow} />;
  }
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
  const [showInputForm, setShowInputForm] = React.useState(false);
  const [inputValues, setInputValues] = React.useState<Record<string, string>>({});
  const [isRunning, setIsRunning] = React.useState(false);

  const isWrite = isWriteAction(action);
  const disabled = isWrite && !allowWrites;
  const hasInputs = action.inputSchema && Object.keys(action.inputSchema).length > 0;
  const ActionIcon = getActionIcon(action);

  const handleExecute = async (input?: Record<string, any>) => {
    setIsRunning(true);
    setShowInputForm(false);
    try {
      await onExecute(input);
    } finally {
      setTimeout(() => setIsRunning(false), 800);
    }
  };

  const actionStyle = isWrite
    ? disabled
      ? "border-white/5 text-muted-foreground/30 cursor-not-allowed"
      : "border-amber-500/20 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
    : isRunning
    ? "border-primary/30 bg-primary/10 text-primary"
    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground";

  return (
    <div className="relative">
      <button
        className={`h-8 px-3 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 ${actionStyle}`}
        onClick={() => {
          if (disabled) return;
          if (hasInputs) {
            setShowInputForm(!showInputForm);
          } else {
            void handleExecute();
          }
        }}
        title={action.description}
        disabled={disabled}
        type="button"
      >
        {isRunning ? (
          <RotateCw className="w-3.5 h-3.5 animate-spin" />
        ) : disabled ? (
          <Lock className="w-3 h-3" />
        ) : (
          <ActionIcon className="w-3.5 h-3.5" />
        )}
        {action.name}
        {hasInputs && !disabled && (
          <ChevronDown className={`w-3 h-3 transition-transform ${showInputForm ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* Input form dropdown */}
      <AnimatePresence>
        {showInputForm && hasInputs && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute bottom-full mb-2 left-0 z-50 w-72 bg-[#1a1a1d] border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {action.name} Parameters
              </span>
              <span className="text-[10px] text-muted-foreground/40">
                {Object.keys(action.inputSchema).length} fields
              </span>
            </div>
            <div className="p-3 space-y-2.5">
              {Object.entries(action.inputSchema).map(([key, schema]: [string, any]) => (
                <div key={key} className="space-y-1">
                  <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{key}</label>
                  <input
                    type={typeof schema === "object" && schema.type === "number" ? "number" : "text"}
                    value={inputValues[key] ?? ""}
                    onChange={(e) => setInputValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={typeof schema === "object" ? (schema.description ?? key) : key}
                    className="w-full h-8 rounded-md bg-white/5 border border-white/10 text-xs text-white px-2 placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/30 transition-all"
                  />
                </div>
              ))}
            </div>
            <div className="px-3 pb-3 flex items-center gap-2">
              <button
                className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
                onClick={() => {
                  const parsed: Record<string, any> = {};
                  for (const [k, v] of Object.entries(inputValues)) {
                    parsed[k] = v;
                  }
                  void handleExecute(parsed);
                }}
                type="button"
              >
                <Play className="w-3 h-3" />
                Execute
              </button>
              <button
                className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                onClick={() => setShowInputForm(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function getActionIcon(action: ActionSpec) {
  const name = (action.name ?? "").toLowerCase();
  if (name.includes("create") || name.includes("add") || name.includes("new")) return Plus;
  if (name.includes("update") || name.includes("edit") || name.includes("modify")) return Edit3;
  if (name.includes("delete") || name.includes("remove")) return Trash2;
  if (name.includes("send") || name.includes("notify") || name.includes("post")) return Send;
  if (name.includes("fetch") || name.includes("get") || name.includes("load") || name.includes("list")) return Eye;
  if (name.includes("refresh") || name.includes("sync")) return RefreshCw;
  if (name.includes("upload") || name.includes("import")) return Upload;
  if (name.includes("alert") || name.includes("notify")) return Bell;
  return Play;
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
