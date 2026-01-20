"use client";

import * as React from "react";
import { TimelineEvent } from "@/lib/toolos/spec";
import { Activity, GitCommit, MessageSquare, AlertCircle } from "lucide-react";

export function SystemTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <div className="text-sm text-muted-foreground p-4">No activity yet.</div>;

  return (
    <div className="space-y-4 p-4">
      {events.map((event, i) => (
        <div key={i} className="flex gap-4 group">
          <div className="flex flex-col items-center">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-full border bg-background shadow-sm group-hover:border-primary/50 transition-colors">
               {getIcon(event.entity)}
            </div>
            {i < events.length - 1 && <div className="w-px flex-1 bg-border my-2 group-hover:bg-primary/20 transition-colors" />}
          </div>
          <div className="flex-1 pb-6">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{event.action}</span>
                <span className="text-xs text-muted-foreground" title={event.timestamp}>
                    {new Date(event.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                <span className="uppercase tracking-wider text-[10px] font-semibold">{event.sourceIntegration}</span>
                <span>•</span>
                <span>{event.entity}</span>
            </div>
            {event.metadata && Object.keys(event.metadata).length > 0 && (
                <div className="mt-2 rounded-md border bg-muted/30 p-2.5 text-xs font-mono">
                    {Object.entries(event.metadata).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                            <span className="opacity-60 shrink-0">{k}:</span>
                            <span className="truncate">{String(v)}</span>
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function getIcon(entity: string) {
    const e = entity.toLowerCase();
    if (e.includes("repo") || e.includes("commit")) return <GitCommit className="h-4 w-4 text-muted-foreground" />;
    if (e.includes("issue") || e.includes("ticket")) return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    if (e.includes("message") || e.includes("email")) return <MessageSquare className="h-4 w-4 text-muted-foreground" />;
    return <Activity className="h-4 w-4 text-muted-foreground" />;
}
