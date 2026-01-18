"use client";

import * as React from "react";
import { Share, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { ZeroStateView } from "@/components/dashboard/zero-state";
import { ExecutionTimeline, type TimelineStep } from "@/components/dashboard/execution-timeline";
import { sendChatMessage } from "@/app/actions/chat";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { ToolRenderer } from "@/components/dashboard/tool-renderer";

interface ProjectWorkspaceProps {
  project?: {
    id: string;
    spec: ToolSpec | null;
  } | null;
  initialMessages: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: {
      missing_integration_id?: string;
      action?: "connect_integration";
    };
  }>;
  connectedIntegrations?: string[];
}

type RuntimeStatus = {
  planner_success: boolean;
  ui_generated: boolean;
  ui_rendered: boolean;
  version_persisted: boolean;
};

export function ProjectWorkspace({
  project,
  initialMessages,
  connectedIntegrations,
}: ProjectWorkspaceProps) {
  // State
  const [inputValue, setInputValue] = React.useState("");
  const [messages, setMessages] = React.useState<any[]>(initialMessages || []);
  const [executionSteps, setExecutionSteps] = React.useState<TimelineStep[]>([]);
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [currentSpec, setCurrentSpec] = React.useState<ToolSpec | null>(project?.spec || null);
  const [toolId, setToolId] = React.useState<string | undefined>(project?.id);
  const [runtimeStatus, setRuntimeStatus] = React.useState<RuntimeStatus | null>(null);

  // Derived state
  const isZeroState = messages.length === 0;

  // Dynamic Header Title
  const headerTitle = currentSpec?.title || "New Chat";

  const handleShare = React.useCallback(async () => {
    try {
      const url = window.location.href;
      if (navigator.share) {
        await navigator.share({ title: headerTitle, url });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        alert("Link copied to clipboard");
      }
    } catch (e) {
      console.error(e);
    }
  }, [headerTitle]);

  React.useEffect(() => {
    if (!currentSpec || !runtimeStatus || runtimeStatus.ui_rendered) return;
    setRuntimeStatus((prev) => (prev ? { ...prev, ui_rendered: true } : prev));
  }, [currentSpec, runtimeStatus]);

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    const userMsg = { role: "user", content: inputValue };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue("");
    setIsExecuting(true);
    setExecutionSteps([{ id: "init", label: "Analyzing Request...", status: "running" }]);

    try {
        const response = await sendChatMessage(
            toolId, 
            inputValue, 
            newHistory.map(m => ({ role: m.role, content: m.content })), 
            currentSpec
        );

        // Update ID if created
        if (response.toolId && !toolId) {
            setToolId(response.toolId);
        }

        // Process Trace for Timeline
        const trace = response.metadata?.trace;
        if (trace) {
            const steps: TimelineStep[] = [];
            
            // 1. Planner/Agent
            if (trace.agents_invoked?.length) {
                trace.agents_invoked.forEach((a: any, i: number) => {
                    steps.push({
                        id: `agent-${i}`,
                        label: `Agent: ${a.task}`,
                        status: "success",
                        narrative: `Invoked agent ${a.agentId} for ${a.task}`
                    });
                });
            }

            // 2. Integrations
            if (trace.integrations_accessed?.length) {
                trace.integrations_accessed.forEach((acc: any, i: number) => {
                    steps.push({
                        id: `int-${i}`,
                        label: `Integration: ${acc.capabilityId}`,
                        status: acc.status,
                        narrative: `Called ${acc.integrationId} (${acc.latency_ms}ms)`
                    });
                });
            }

            // 3. Mutations
            if (trace.ui_mutations?.length) {
                steps.push({
                    id: "ui-gen",
                    label: "Generating UI",
                    status: "success",
                    narrative: `Created ${trace.ui_mutations.length} components`,
                    resultAvailable: true
                });
            }

            if (trace.outcome === "failure") {
                steps.push({
                    id: "fail",
                    label: "Execution Failed",
                    status: "error",
                    narrative: trace.failure_reason
                });
            } else {
                steps.push({
                    id: "done",
                    label: "Complete",
                    status: "success"
                });
            }
            setExecutionSteps(steps);
        }

        const runtime = response.metadata?.runtime as RuntimeStatus | undefined;
        if (runtime) {
            setRuntimeStatus(runtime);
        }

        // Update Spec
        if (response.spec) {
            setCurrentSpec(response.spec);
        }

        // Add Assistant Message
        const assistantMsg = { 
            role: "assistant", 
            content: response.message.content 
        };
        setMessages(prev => [...prev, assistantMsg]);

    } catch (e) {
        console.error(e);
        const errorMsg = { role: "assistant", content: "Something went wrong. Please try again." };
        setMessages(prev => [...prev, errorMsg]);
        setExecutionSteps(prev => [...prev, { id: "err", label: "System Error", status: "error", narrative: String(e) }]);
    } finally {
        setIsExecuting(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      {!isZeroState && (
        <header className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-border/50 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex-1" />
          <div className="font-semibold">{headerTitle}</div>
          <div className="flex-1 flex justify-end items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={handleShare}
            >
              <Share className="h-4 w-4" />
              Share
            </Button>
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center ring-2 ring-background">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </header>
      )}

      <div className="flex-1 overflow-hidden relative">
        {isZeroState ? (
          <ZeroStateView
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSubmit={handleSubmit}
            onSuggestionClick={(val) => {
              setInputValue(val);
              // Optional: auto-submit?
            }}
          />
        ) : (
          <div className="flex h-full">
            <div className="flex h-full flex-1 flex-col border-r border-border/50">
              <ScrollArea className="flex-1">
                <div className="mx-auto max-w-3xl px-4 py-8">
                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className="mb-4 flex w-full justify-start"
                    >
                      <div
                        className={
                          m.role === "user"
                            ? "ml-auto max-w-[80%] rounded-2xl bg-primary text-primary-foreground px-4 py-3"
                            : "mr-auto max-w-[80%] rounded-2xl bg-muted/40 border border-border/50 px-4 py-3"
                        }
                      >
                        <div className="text-sm whitespace-pre-wrap">
                          {m.content}
                        </div>
                      </div>
                    </div>
                  ))}

                  <ExecutionTimeline steps={executionSteps} />

                  <div className="h-20" />
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-border/50 bg-background/80 backdrop-blur-md">
                <PromptBar
                  value={inputValue}
                  onChange={setInputValue}
                  onSubmit={handleSubmit}
                  className="shadow-lg"
                  isLoading={isExecuting}
                />
              </div>
            </div>

            <div className="hidden h-full min-w-[320px] max-w-xl flex-1 bg-muted/5 lg:flex lg:flex-col">
              {currentSpec && toolId ? (
                <ToolRenderer toolId={toolId} spec={currentSpec} connectedIntegrations={connectedIntegrations} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                  Describe the tool you want to build to see a live preview.
                </div>
              )}
            </div>

            {runtimeStatus && (
              <DebugOverlay status={runtimeStatus} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DebugOverlay({ status }: { status: RuntimeStatus }) {
  const badgeClass = (ok: boolean) =>
    ok ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600" :
         "inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600";

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 w-64 rounded-md border bg-background/95 p-3 text-xs shadow-lg">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Runtime Status
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span>Planner</span>
          <span className={badgeClass(status.planner_success)}>{status.planner_success ? "ok" : "error"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>UI generated</span>
          <span className={badgeClass(status.ui_generated)}>{status.ui_generated ? "yes" : "no"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>UI rendered</span>
          <span className={badgeClass(status.ui_rendered)}>{status.ui_rendered ? "yes" : "no"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Version persisted</span>
          <span className={badgeClass(status.version_persisted)}>{status.version_persisted ? "yes" : "no"}</span>
        </div>
      </div>
    </div>
  );
}
