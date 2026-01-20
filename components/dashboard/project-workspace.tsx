"use client";

import * as React from "react";
import { Share, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { ZeroStateView } from "@/components/dashboard/zero-state";
import { BuildProgressPanel, type BuildStep } from "@/components/dashboard/build-progress-panel";
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
}

export function ProjectWorkspace({
  project,
  initialMessages,
}: ProjectWorkspaceProps) {
  // State
  const [inputValue, setInputValue] = React.useState("");
  const [messages, setMessages] = React.useState<any[]>(initialMessages || []);
  const [buildSteps, setBuildSteps] = React.useState<BuildStep[]>(defaultBuildSteps());
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [currentSpec, setCurrentSpec] = React.useState<ToolSpec | null>(project?.spec || null);
  const [toolId, setToolId] = React.useState<string | undefined>(project?.id);
  const [showBuildSteps, setShowBuildSteps] = React.useState(true);

  // Derived state
  const isZeroState = messages.length === 0;

  // Dynamic Header Title
  const headerTitle =
    (currentSpec as any)?.purpose ||
    (currentSpec as any)?.title ||
    (currentSpec as any)?.name ||
    "New Chat";

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

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    const userMsg = { role: "user", content: inputValue };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInputValue("");
    setIsExecuting(true);
    setBuildSteps(markFirstRunning(defaultBuildSteps()));

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

        const pipelineSteps = response.metadata?.build_steps as BuildStep[] | undefined;
        if (pipelineSteps && pipelineSteps.length > 0) {
            setBuildSteps(pipelineSteps);
        } else {
            setBuildSteps(markAllSuccess(defaultBuildSteps()));
        }

        // Update Spec
        if (response.spec) {
            setCurrentSpec(response.spec as ToolSpec);
        }

        // Add Assistant Message
        const assistantMsg = { 
            role: "assistant", 
            content: response.message.content 
        };
        const refinements = response.metadata?.refinements as string[] | undefined;
        if (refinements && refinements.length > 0) {
            const refinementMsg = {
                role: "assistant",
                content: `Optional refinements:\n${refinements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
            };
            setMessages(prev => [...prev, assistantMsg, refinementMsg]);
        } else {
            setMessages(prev => [...prev, assistantMsg]);
        }

    } catch (e) {
        console.error(e);
        const errorMsg = { role: "assistant", content: "Something went wrong. Please try again." };
        setMessages(prev => [...prev, errorMsg]);
        setBuildSteps(markError(defaultBuildSteps(), e instanceof Error ? e.message : String(e)));
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
            <div className="flex h-full w-[420px] flex-col border-r border-border/50">
              <ScrollArea className="flex-1">
                <div className="px-4 py-6 space-y-6">
                  <BuildProgressPanel
                    steps={buildSteps}
                    collapsed={!showBuildSteps}
                    onToggle={() => setShowBuildSteps((prev) => !prev)}
                  />
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

                  <div className="h-10" />
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

            <div className="flex h-full flex-1 flex-col bg-muted/5">
              {currentSpec && toolId ? (
                <ToolRenderer toolId={toolId} spec={currentSpec} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                  Describe the tool you want to build to see a live preview.
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function defaultBuildSteps(): BuildStep[] {
  return [
    { id: "intent", title: "Understanding intent", status: "pending", logs: [] },
    { id: "entities", title: "Identifying entities", status: "pending", logs: [] },
    { id: "integrations", title: "Selecting integrations", status: "pending", logs: [] },
    { id: "actions", title: "Defining actions", status: "pending", logs: [] },
    { id: "workflows", title: "Assembling workflows", status: "pending", logs: [] },
    { id: "compile", title: "Compiling runtime", status: "pending", logs: [] },
    { id: "readiness", title: "Validating data readiness", status: "pending", logs: [] },
    { id: "runtime", title: "Executing initial fetch", status: "pending", logs: [] },
    { id: "views", title: "Rendering views", status: "pending", logs: [] },
  ];
}

function markFirstRunning(steps: BuildStep[]): BuildStep[] {
  const next = steps.map((step) => ({ ...step, logs: [...step.logs] }));
  if (next[0]) next[0].status = "running";
  return next;
}

function markAllSuccess(steps: BuildStep[]): BuildStep[] {
  return steps.map((step) => ({ ...step, status: "success" as const }));
}

function markError(steps: BuildStep[], message: string): BuildStep[] {
  const next = steps.map((step) => ({ ...step, logs: [...step.logs] }));
  const compileStep = next.find((step) => step.id === "compile");
  if (compileStep) {
    compileStep.status = "error";
    compileStep.logs.push(message);
  }
  return next;
}
