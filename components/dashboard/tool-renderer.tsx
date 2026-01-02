"use client";

import * as React from "react";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";

interface ToolRendererProps {
  spec: DashboardSpec;
}

export function ToolRenderer({ spec }: ToolRendererProps) {
  if (!spec) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No tool specification found. Start chatting to build one.
      </div>
    );
  }

  // TODO: Add support for real data.
  // Currently, we enforce NO mock data.
  // Since we don't have real data passing in yet, we render the empty state.
  const hasRealData = false; 

  return (
    <div className="h-full overflow-auto bg-muted/5 p-6">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{spec.title}</h1>
        {spec.description && (
          <p className="text-muted-foreground">{spec.description}</p>
        )}
      </div>

      {!hasRealData ? (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          <p className="mb-2 text-lg font-medium">No data yet</p>
          <p className="text-sm">
            Connect integrations and define queries to see real data.
          </p>
        </div>
      ) : (
        /* Real data rendering will go here */
        <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* ... */}
        </div>
      )}
    </div>
  );
}
