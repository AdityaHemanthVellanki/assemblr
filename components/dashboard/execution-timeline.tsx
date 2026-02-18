"use client";

import { Check, Loader2, AlertCircle, Circle } from "lucide-react";

export interface TimelineStep {
  id: string;
  label: string;
  status: "pending" | "running" | "success" | "error";
  narrative?: string;
  resultAvailable?: boolean;
}

export function ExecutionTimeline({ steps }: { steps: TimelineStep[] }) {
  // Progressive reveal: show all active/completed steps plus the next pending step
  const firstPendingIdx = steps.findIndex(s => s.status === "pending");
  const hasActiveStep = steps.some(s => s.status !== "pending");

  // Show steps up to and including the first pending step after active ones
  const visibleSteps = hasActiveStep
    ? steps.filter((s, i) => s.status !== "pending" || i === firstPendingIdx)
    : steps.slice(0, 1); // Fallback: show at least the first step

  if (visibleSteps.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 py-2 px-2">
      {visibleSteps.map((step, idx) => (
        <div
          key={step.id}
          className="animate-in fade-in slide-in-from-bottom-1 duration-300 fill-mode-backwards"
          style={{ animationDelay: `${idx * 80}ms` }}
        >
          <div className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            {step.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />}
            {step.status === "success" && (
              <div className="h-3.5 w-3.5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                <Check className="h-2.5 w-2.5 text-emerald-400" />
              </div>
            )}
            {step.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
            {step.status === "pending" && <Circle className="h-3.5 w-3.5 text-neutral-600 shrink-0" />}

            <div className="flex flex-col min-w-0">
              <span className={`text-xs leading-tight ${step.status === "pending" ? "text-neutral-500" : "text-neutral-300"}`}>{step.label}</span>
              {step.narrative && (
                <span className="text-[11px] text-neutral-500 leading-tight mt-0.5 truncate">
                  {step.narrative}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
