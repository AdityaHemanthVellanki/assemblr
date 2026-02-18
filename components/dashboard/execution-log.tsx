"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, Clock, ChevronDown, RefreshCw, Play } from "lucide-react";
import { safeFetch } from "@/lib/api/client";

interface ExecutionRun {
  id: string;
  status: string;
  current_step: string | null;
  workflow_id: string | null;
  action_id: string | null;
  trigger_id: string | null;
  retries: number;
  created_at: string;
  updated_at: string;
  logs: Array<Record<string, any>>;
}

interface ExecutionLogProps {
  toolId: string;
}

export function ExecutionLog({ toolId }: ExecutionLogProps) {
  const [runs, setRuns] = React.useState<ExecutionRun[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [expandedRun, setExpandedRun] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  const fetchRuns = React.useCallback(async () => {
    try {
      const data = await safeFetch<ExecutionRun[]>(`/api/tools/${toolId}/runs`);
      setRuns(Array.isArray(data) ? data : []);
    } catch {
      setRuns([]);
    } finally {
      setIsLoading(false);
    }
  }, [toolId]);

  React.useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  const retryRun = async (runId: string) => {
    setRetrying(runId);
    try {
      await safeFetch(`/api/tools/${toolId}/runs/${runId}/retry`, {
        method: "POST",
      });
      await fetchRuns();
    } catch (err) {
      console.error("Retry failed:", err);
    } finally {
      setRetrying(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Clock className="w-4 h-4 mr-2 animate-spin" />
        Loading runs...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <Play className="w-12 h-12 mb-4 opacity-20" />
        <p>No execution runs yet.</p>
        <p className="text-xs mt-1 opacity-60">Runs appear here when workflows or actions are executed.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <h3 className="text-sm font-semibold text-white">Execution Runs</h3>
        <button
          onClick={fetchRuns}
          className="h-7 px-2.5 rounded-lg text-xs text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex items-center gap-1.5"
          type="button"
        >
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {/* Run List */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-white/5">
          {runs.map((run) => (
            <div key={run.id}>
              <button
                className="w-full px-6 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors text-left"
                onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                type="button"
              >
                <RunStatusIcon status={run.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white">
                      {run.workflow_id ?? run.action_id ?? "Unknown"}
                    </span>
                    {run.trigger_id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground">
                        {run.trigger_id}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(run.created_at).toLocaleString()} · Step: {run.current_step ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {run.status === "failed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); retryRun(run.id); }}
                      disabled={retrying === run.id}
                      className="h-6 px-2 rounded text-[10px] bg-white/5 text-muted-foreground hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
                      type="button"
                    >
                      {retrying === run.id ? "Retrying..." : "Retry"}
                    </button>
                  )}
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedRun === run.id ? "rotate-180" : ""}`} />
                </div>
              </button>

              {/* Expanded Logs */}
              <AnimatePresence>
                {expandedRun === run.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-4">
                      <div className="rounded-lg border border-white/10 bg-black/20 divide-y divide-white/5">
                        {Array.isArray(run.logs) && run.logs.length > 0 ? (
                          run.logs.map((log, i) => (
                            <div key={i} className="px-3 py-2 flex items-start gap-2">
                              <LogStatusDot status={log.status} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] font-mono text-white/80">{log.id ?? `step-${i}`}</span>
                                  {log.actionId && (
                                    <span className="text-[10px] text-muted-foreground">{log.actionId}</span>
                                  )}
                                  {log.durationMs != null && (
                                    <span className="text-[10px] text-muted-foreground">{log.durationMs}ms</span>
                                  )}
                                </div>
                                {log.error && (
                                  <p className="text-[10px] text-red-400 mt-0.5 truncate">{log.error}</p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">
                                {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : ""}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="px-3 py-4 text-center text-[10px] text-muted-foreground">
                            No log entries
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  if (status === "running") return <Clock className="w-4 h-4 text-blue-400 animate-spin shrink-0" />;
  if (status === "blocked") return <Clock className="w-4 h-4 text-amber-400 shrink-0" />;
  return <Clock className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function LogStatusDot({ status }: { status: string }) {
  const color =
    status === "done" ? "bg-emerald-400" :
    status === "failed" ? "bg-red-400" :
    status === "retrying" ? "bg-amber-400" :
    status === "blocked" ? "bg-amber-400" :
    "bg-muted-foreground";
  return <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${color}`} />;
}
