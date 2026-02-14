"use client";

import * as React from "react";
import { Loader2, Share, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { ToolRenderer } from "@/components/dashboard/tool-renderer";
import { ProjectHeader } from "@/components/dashboard/project-header";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { type ToolLifecycleState } from "@/lib/toolos/spec";
import { type OrgRole } from "@/lib/permissions-shared";
import { type ToolBuildLog } from "@/lib/toolos/build-state-machine";
import { safeFetch } from "@/lib/api/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";


interface ProjectWorkspaceProps {
  project?: {
    id: string;
    name?: string;
    description?: string;
    spec: ToolSpec | null;
    status?: string | null;
    error_message?: string | null;
    view_spec?: any;
    data_snapshot?: any;
    spec_error?: string | null;
    org_id: string;
  } | null;
  initialMessages: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: any;
  }>;
  role: OrgRole;
  initialPrompt?: string | null;
  initialRequiredIntegrations?: string[] | null;
  readOnly?: boolean;
  shareOwnerName?: string;
  shareScope?: "version" | "all";
  shareVersionId?: string | null;
}

export function ProjectWorkspace({
  project,
  initialMessages,
  role,
  initialPrompt,
  initialRequiredIntegrations,
  readOnly,
}: ProjectWorkspaceProps) {
  // Core Identity State
  const [toolId, setToolId] = React.useState<string | undefined>(project?.id);
  const [currentSpec, setCurrentSpec] = React.useState<ToolSpec | null>(project?.spec || null);
  const [projectStatus, setProjectStatus] = React.useState<string>(project?.status || "IDLE");

  // UI State
  const [isShareOpen, setIsShareOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);

  // Handlers
  const handleSpecUpdate = React.useCallback((spec: ToolSpec) => {
    setCurrentSpec(spec);
  }, []);

  const handleStatusUpdate = React.useCallback((status: string) => {
    setProjectStatus(status);
  }, []);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* LEFT SIDE: Chat Interface (Controller) */}
      <aside
        className={`flex flex-col border-r border-border bg-background z-20 shadow-xl shadow-black/5 transition-all duration-300 ease-in-out ${isSidebarOpen ? "w-[400px] translate-x-0" : "w-0 -translate-x-full opacity-0"}`}
      >
        <div className="w-[400px] flex flex-col h-full">
          <ProjectHeader
            title={currentSpec?.name || project?.name || "Untitled Project"}
            status={projectStatus}
            onShare={() => setIsShareOpen(true)}
          />
          <ChatPanel
            toolId={toolId}
            initialMessages={initialMessages}
            initialPrompt={initialPrompt}
            initialRequiredIntegrations={initialRequiredIntegrations}
            onSpecUpdate={handleSpecUpdate}
            onStatusUpdate={handleStatusUpdate}
            onToolIdChange={setToolId}
            readOnly={readOnly}
          />
        </div>
      </aside>

      {/* RIGHT SIDE: Tool Renderer (Canvas/Output) */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden bg-muted/10">
        {/* Toggle Sidebar Button */}
        <div className="absolute top-4 left-4 z-30">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 bg-background shadow-sm border-border/60 hover:bg-muted"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Collapse Chat" : "Open Chat"}
          >
            {isSidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            )}
          </Button>
        </div>

        <div className={`absolute inset-0 p-4 transition-all duration-300 ${isSidebarOpen ? "" : "pl-16"}`}>
          <div className="h-full w-full rounded-xl border border-border/40 bg-background shadow-sm overflow-hidden relative">
            <ToolRenderer
              toolId={toolId || ""}
              spec={currentSpec}
              status={projectStatus}
            />
          </div>
        </div>
      </main>

      {/* Share Dialog */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share Tool</DialogTitle>
          </DialogHeader>
          <div className="py-6">
            <p className="text-sm text-muted-foreground">Sharing functionality is being upgraded.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
