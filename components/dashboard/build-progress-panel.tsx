"use client";

import { CheckCircle2, AlertCircle, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type BuildStep = {
  id: string;
  title: string;
  status: "pending" | "running" | "success" | "error";
  logs: string[];
};

export function BuildProgressPanel({
  steps,
  collapsed,
  onToggle,
}: {
  steps: BuildStep[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background">
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
        onClick={onToggle}
        type="button"
      >
        Tool build progress
        <span className="text-xs text-muted-foreground">{collapsed ? "Show" : "Hide"}</span>
      </button>
      {!collapsed && (
        <div className="border-t border-border/60 px-4 py-3">
          <div className="space-y-3">
            {steps.map((step) => (
              <div key={step.id} className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <StatusIcon status={step.status} />
                  <div className="flex-1 font-medium">{step.title}</div>
                  <div className={cn("text-xs", statusColor(step.status))}>
                    {step.status}
                  </div>
                </div>
                {step.logs.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {step.logs.map((log, index) => (
                      <div key={`${step.id}-log-${index}`}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: BuildStep["status"] }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function statusColor(status: BuildStep["status"]) {
  if (status === "success") return "text-emerald-500";
  if (status === "error") return "text-red-500";
  if (status === "running") return "text-muted-foreground";
  return "text-muted-foreground";
}
