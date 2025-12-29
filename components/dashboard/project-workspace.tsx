"use client";

import * as React from "react";

import { ChatPanel } from "@/components/dashboard/chat-panel";
import { ToolRenderer } from "@/components/dashboard/tool-renderer";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";

interface ProjectWorkspaceProps {
  project: {
    id: string;
    spec: DashboardSpec | null;
  };
  initialMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

export function ProjectWorkspace({
  project,
  initialMessages,
}: ProjectWorkspaceProps) {
  const [spec, setSpec] = React.useState<DashboardSpec | null>(project.spec);

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
          <ToolRenderer spec={spec} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <h3 className="text-lg font-semibold">Welcome to Assemblr</h3>
            <p className="text-sm text-muted-foreground">
              Describe the tool you want to build in the chat on the left.
              <br />
              For example: &quot;Create a revenue dashboard with a bar chart&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
