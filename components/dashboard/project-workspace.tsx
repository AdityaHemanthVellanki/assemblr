"use client";

import * as React from "react";

import { ChatPanel } from "@/components/dashboard/chat-panel";
import { ToolRenderer } from "@/components/dashboard/tool-renderer";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import { runToolExecution } from "@/app/actions/execute-tool";
import type { ExecutionResult } from "@/lib/execution/types";

interface ProjectWorkspaceProps {
  project: {
    id: string;
    spec: ToolSpec | null;
  };
  initialMessages: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: {
      missing_integration_id?: string;
      action?: "connect_integration";
    };
  }>;
}

export function ProjectWorkspace({
  project,
  initialMessages,
}: ProjectWorkspaceProps) {
  const [spec, setSpec] = React.useState<ToolSpec | null>(project.spec);
  const [results, setResults] = React.useState<Record<string, ExecutionResult>>({});
  const [isExecuting, setIsExecuting] = React.useState(false);

  // Re-execute whenever spec changes (debounced ideally, but strict for now)
  React.useEffect(() => {
    if (!spec) {
      setResults({});
      return;
    }

    // Mini apps manage their own execution via runtime
    if (spec.kind === "mini_app") {
      return;
    }

    if (spec.views.length === 0) {
      setResults({});
      return;
    }

    let isMounted = true;

    async function execute() {
      setIsExecuting(true);
      try {
        const res = await runToolExecution(project.id);
        if (isMounted && res.success && res.results) {
          setResults(res.results);
        }
      } catch (err) {
        console.error("Execution error:", err);
      } finally {
        if (isMounted) setIsExecuting(false);
      }
    }

    // Execute immediately on spec update
    execute();

    return () => {
      isMounted = false;
    };
  }, [spec, project.id]);

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-lg border bg-background shadow-sm">
      <div className="w-[400px] min-w-[300px] max-w-[500px] shrink-0">
        <ChatPanel
          toolId={project.id}
          initialMessages={initialMessages}
          onSpecUpdate={setSpec}
        />
      </div>
      <div className="flex-1 border-l">
        {spec ? (
          <ToolRenderer toolId={project.id} spec={spec} executionResults={results} isLoading={isExecuting} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <h3 className="text-lg font-semibold">Welcome to Assemblr</h3>
            <p className="text-sm text-muted-foreground">
              Describe the tool you want to build in the chat on the left.
              <br />
              For example: &quot;Show me my Linear issues&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
