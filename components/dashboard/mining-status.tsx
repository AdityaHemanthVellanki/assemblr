"use client";

import { Activity, GitBranch, ArrowRight, Cpu } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type MiningStatusData = {
  stage: "idle" | "build_graph" | "mine_patterns" | "complete";
  patternCount: number;
  crossSystemCount: number;
  eventCount: number;
  nodeCount: number;
  edgeCount: number;
  message?: string;
};

const STAGE_LABELS: Record<MiningStatusData["stage"], string> = {
  idle: "Ready to mine",
  build_graph: "Building event graph...",
  mine_patterns: "Mining patterns...",
  complete: "Mining complete",
};

export function MiningStatusPanel({
  data,
  onRunMining,
  isRunning,
}: {
  data: MiningStatusData;
  onRunMining: () => void;
  isRunning: boolean;
}) {
  const isActive = data.stage !== "idle" && data.stage !== "complete";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Pattern Mining
          </h2>
          <p className="text-sm text-muted-foreground">
            {data.message || STAGE_LABELS[data.stage]}
          </p>
        </div>
        <button
          onClick={onRunMining}
          disabled={isRunning || data.eventCount === 0}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
            isRunning
              ? "bg-blue-500/20 text-blue-400 cursor-wait"
              : data.eventCount === 0
                ? "bg-muted/30 text-muted-foreground cursor-not-allowed"
                : "bg-primary/10 text-primary hover:bg-primary/20",
          )}
        >
          <Cpu className={cn("h-4 w-4", isRunning && "animate-pulse")} />
          {isRunning ? "Mining..." : "Mine Patterns"}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Activity}
          label="Events"
          value={data.eventCount}
          color="text-blue-400"
        />
        <StatCard
          icon={GitBranch}
          label="Graph Edges"
          value={data.edgeCount}
          color="text-purple-400"
        />
        <StatCard
          icon={ArrowRight}
          label="Patterns"
          value={data.patternCount}
          color="text-emerald-400"
        />
        <StatCard
          icon={GitBranch}
          label="Cross-System"
          value={data.crossSystemCount}
          color="text-orange-400"
        />
      </div>

      {/* Progress bar for active mining */}
      {isActive && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
              style={{
                width:
                  data.stage === "build_graph"
                    ? "40%"
                    : data.stage === "mine_patterns"
                      ? "80%"
                      : "100%",
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {STAGE_LABELS[data.stage]}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/40 bg-card/20 p-3">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
