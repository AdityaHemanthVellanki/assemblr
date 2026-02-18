"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { safeFetch } from "@/lib/api/client";

interface ToolHealth {
  toolId: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  lastRunAt: string | null;
  triggerInvocations: number;
  recentErrors: string[];
}

interface WorkflowMetric {
  id: string;
  metricName: string;
  metricValue: number;
  dimensions: Record<string, any>;
  recordedAt: string;
}

interface HealthDashboardProps {
  toolId: string;
}

export function HealthDashboard({ toolId }: HealthDashboardProps) {
  const [health, setHealth] = React.useState<ToolHealth | null>(null);
  const [metrics, setMetrics] = React.useState<WorkflowMetric[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [windowHours, setWindowHours] = React.useState(24);

  const fetchHealth = React.useCallback(async () => {
    try {
      const data = await safeFetch<{
        health: ToolHealth;
        metrics: WorkflowMetric[];
      }>(`/api/tools/${toolId}/metrics?windowHours=${windowHours}`);
      setHealth(data.health);
      setMetrics(data.metrics ?? []);
    } catch {
      setHealth(null);
      setMetrics([]);
    } finally {
      setIsLoading(false);
    }
  }, [toolId, windowHours]);

  React.useEffect(() => {
    setIsLoading(true);
    void fetchHealth();
  }, [fetchHealth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Activity className="w-4 h-4 mr-2 animate-spin" />
        Loading health data...
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm p-8">
        <Activity className="w-12 h-12 mb-4 opacity-20" />
        <p>No metrics available yet.</p>
        <p className="text-xs mt-1 opacity-60">
          Metrics are recorded as workflows and actions execute.
        </p>
      </div>
    );
  }

  // Group metrics by name for sparkline-style display
  const metricGroups = groupMetrics(metrics);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Health</h3>
          <HealthBadge rate={health.successRate} />
        </div>
        <div className="flex items-center gap-1">
          {[6, 12, 24, 48].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setWindowHours(h)}
              className={`px-2 py-1 text-[10px] rounded-md transition-colors ${
                windowHours === h
                  ? "bg-white/10 text-white"
                  : "text-muted-foreground hover:text-white hover:bg-white/5"
              }`}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-6">
        <KPICard
          label="Total Runs"
          value={health.totalRuns}
          icon={<Activity className="w-4 h-4" />}
          color="blue"
        />
        <KPICard
          label="Success Rate"
          value={`${Math.round(health.successRate * 100)}%`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          color={health.successRate >= 0.9 ? "emerald" : health.successRate >= 0.7 ? "amber" : "red"}
        />
        <KPICard
          label="Avg Duration"
          value={formatDuration(health.avgDurationMs)}
          icon={<Clock className="w-4 h-4" />}
          color="purple"
        />
        <KPICard
          label="Trigger Invocations"
          value={health.triggerInvocations}
          icon={<Zap className="w-4 h-4" />}
          color="amber"
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6 space-y-6">
        {/* Success/Failure Breakdown */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Execution Breakdown
          </h4>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-3 rounded-full bg-white/5 overflow-hidden">
              {health.totalRuns > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${health.successRate * 100}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="h-full rounded-full bg-emerald-500"
                />
              )}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Success:</span>
              <span className="text-white font-medium">{health.successCount}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">Failed:</span>
              <span className="text-white font-medium">{health.failureCount}</span>
            </span>
          </div>
        </div>

        {/* Metric Activity Feed */}
        {metricGroups.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Metric Activity
            </h4>
            <div className="space-y-2">
              {metricGroups.map((group) => (
                <div
                  key={group.name}
                  className="flex items-center justify-between py-2 border-b border-white/5 last:border-b-0"
                >
                  <div className="flex items-center gap-2">
                    <MetricIcon name={group.name} />
                    <span className="text-xs text-white">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MiniSparkline values={group.values} />
                    <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
                      {group.count}x
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Errors */}
        {health.recentErrors.length > 0 && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
            <h4 className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Recent Errors
            </h4>
            <div className="space-y-2">
              {health.recentErrors.map((err, i) => (
                <div
                  key={i}
                  className="text-[11px] text-red-300/80 font-mono bg-black/20 rounded-lg px-3 py-2 break-all"
                >
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Run */}
        {health.lastRunAt && (
          <div className="text-[10px] text-muted-foreground/60 text-center">
            Last activity: {new Date(health.lastRunAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function HealthBadge({ rate }: { rate: number }) {
  if (rate >= 0.95) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        Healthy
      </span>
    );
  }
  if (rate >= 0.7) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
        Degraded
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
      Unhealthy
    </span>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: "blue" | "emerald" | "amber" | "red" | "purple";
}) {
  const colorMap = {
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    emerald: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    amber: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`h-7 w-7 rounded-lg flex items-center justify-center border ${colorMap[color]}`}
        >
          {icon}
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-white tabular-nums">{value}</div>
    </motion.div>
  );
}

function MetricIcon({ name }: { name: string }) {
  if (name.includes("completed")) {
    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  }
  if (name.includes("failed")) {
    return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  }
  if (name.includes("duration")) {
    return <Clock className="w-3.5 h-3.5 text-purple-400" />;
  }
  if (name.includes("trigger")) {
    return <Zap className="w-3.5 h-3.5 text-amber-400" />;
  }
  return <TrendingUp className="w-3.5 h-3.5 text-blue-400" />;
}

function MiniSparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const width = 60;
  const height = 16;
  const step = width / Math.max(values.length - 1, 1);

  const points = values
    .slice(-12)
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="opacity-50">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
      />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

interface MetricGroup {
  name: string;
  count: number;
  values: number[];
}

function groupMetrics(metrics: WorkflowMetric[]): MetricGroup[] {
  const groups = new Map<string, { count: number; values: number[] }>();
  for (const m of metrics) {
    const existing = groups.get(m.metricName) ?? { count: 0, values: [] };
    existing.count++;
    existing.values.push(m.metricValue);
    groups.set(m.metricName, existing);
  }
  return Array.from(groups.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count);
}
