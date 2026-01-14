"use client";

import { Check, Loader2, AlertCircle, Circle } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export interface TimelineStep {
  id: string;
  label: string; // e.g. "Processing Read Data"
  status: "pending" | "running" | "success" | "error";
  narrative?: string; 
  resultAvailable?: boolean;
}

export function ExecutionTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="flex flex-col gap-6 py-6">
      {steps.map((step, idx) => (
        <div key={step.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500 fill-mode-backwards" style={{ animationDelay: `${idx * 150}ms` }}>
            {/* Step Header */}
            <div className="flex items-center justify-between rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-3">
                    {step.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {step.status === "success" && <div className="h-4 w-4 rounded-full bg-green-500/20 flex items-center justify-center"><Check className="h-3 w-3 text-green-500" /></div>}
                    {step.status === "error" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {step.status === "pending" && <Circle className="h-4 w-4 text-muted-foreground" />}
                    
                    <span className="font-medium text-sm">{step.label}</span>
                </div>
                {step.resultAvailable && (
                    <div className="text-xs font-medium text-green-500 px-2 py-0.5 rounded-full bg-green-500/10">
                        Result Available
                    </div>
                )}
            </div>

            {/* Narrative */}
            {step.narrative && (
                <div className="mt-3 pl-1 text-base text-foreground/90 leading-relaxed">
                    {step.narrative}
                </div>
            )}
        </div>
      ))}
    </div>
  );
}
