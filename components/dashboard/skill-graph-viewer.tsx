"use client";

import {
  Zap,
  ArrowRight,
  GitBranch,
  Clock,
  Shield,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/ui/cn";
import type { SkillGraph, SkillNode } from "@/lib/skillgraph/compiler/skill-schema";

const NODE_COLORS: Record<SkillNode["type"], { bg: string; border: string; icon: typeof Zap }> = {
  trigger: { bg: "bg-blue-500/10", border: "border-blue-500/40", icon: Zap },
  action: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", icon: ArrowRight },
  condition: { bg: "bg-yellow-500/10", border: "border-yellow-500/40", icon: GitBranch },
  transform: { bg: "bg-purple-500/10", border: "border-purple-500/40", icon: ArrowRight },
  wait: { bg: "bg-muted/20", border: "border-muted/40", icon: Clock },
  notify: { bg: "bg-orange-500/10", border: "border-orange-500/40", icon: Shield },
};

/**
 * Visual renderer for a single SkillGraph.
 * Renders nodes as a vertical flow with metadata sidebar.
 */
export function SkillGraphViewer({ skill }: { skill: SkillGraph }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/40 bg-card/10 p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground truncate">
            {skill.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {skill.description}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ConfidenceBadge confidence={skill.metadata.confidence} />
          {skill.metadata.crossSystem && (
            <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-400">
              Cross-System
            </span>
          )}
        </div>
      </div>

      {/* Node Flow */}
      <div className="flex flex-col gap-1">
        {skill.nodes.map((node, i) => {
          const config = NODE_COLORS[node.type];
          const NodeIcon = config.icon;

          return (
            <div key={node.id}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                  config.bg,
                  config.border,
                  node.optional && "opacity-70 border-dashed",
                )}
              >
                <NodeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {node.description}
                    </span>
                    {node.optional && (
                      <span className="text-[10px] text-muted-foreground">(optional)</span>
                    )}
                  </div>
                  {node.source && (
                    <span className="text-[10px] text-muted-foreground">
                      {node.source}
                    </span>
                  )}
                </div>
              </div>
              {/* Arrow between nodes */}
              {i < skill.nodes.length - 1 && (
                <div className="flex items-center justify-center py-0.5">
                  <ChevronRight className="h-3 w-3 rotate-90 text-muted-foreground/40" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Metadata Footer */}
      <div className="flex flex-wrap gap-3 border-t border-border/20 pt-3 text-xs text-muted-foreground">
        <span>Observed {skill.metadata.frequency}x</span>
        <span>·</span>
        <span>{skill.metadata.actorCount} actors</span>
        <span>·</span>
        <span>Entropy: {skill.metadata.entropy.toFixed(2)}</span>
        <span>·</span>
        <span>{skill.metadata.integrations.join(", ")}</span>
      </div>
    </div>
  );
}

/**
 * Grid list of all discovered skill graphs.
 */
export function SkillGraphList({
  skills,
  onSelect,
}: {
  skills: SkillGraph[];
  onSelect?: (skill: SkillGraph) => void;
}) {
  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/40 py-12">
        <GitBranch className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          No skill graphs compiled yet
        </p>
        <p className="text-xs text-muted-foreground/60">
          Run ingestion and mining to discover behavioral patterns
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Discovered Skills
        </h2>
        <span className="text-sm text-muted-foreground">
          {skills.length} skill{skills.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {skills.map((skill) => (
          <div
            key={skill.id}
            onClick={() => onSelect?.(skill)}
            className={cn(
              "cursor-pointer transition-all",
              onSelect && "hover:ring-1 hover:ring-primary/40 rounded-xl",
            )}
          >
            <SkillGraphViewer skill={skill} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 70
      ? "text-emerald-400 bg-emerald-500/10"
      : pct >= 40
        ? "text-yellow-400 bg-yellow-500/10"
        : "text-red-400 bg-red-500/10";

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", color)}>
      {pct}% confidence
    </span>
  );
}
