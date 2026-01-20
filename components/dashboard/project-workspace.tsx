"use client";

import * as React from "react";
import { Share, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { ZeroStateView } from "@/components/dashboard/zero-state";
import { BuildProgressPanel, type BuildStep } from "@/components/dashboard/build-progress-panel";
import { sendChatMessage } from "@/app/actions/chat";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { ToolRenderer } from "@/components/dashboard/tool-renderer";
import { canEditProjects, type OrgRole } from "@/lib/auth/permissions.client";
import { type ToolBuildLog } from "@/lib/toolos/build-state-machine";
import { type ToolLifecycleState } from "@/lib/toolos/spec";

interface ProjectWorkspaceProps {
  project?: {
    id: string;
    spec: ToolSpec | null;
    lifecycle_state?: ToolLifecycleState | null;
    build_logs?: ToolBuildLog[] | null;
  } | null;
  initialMessages: Array<{
    role: "user" | "assistant";
    content: string;
    metadata?: {
      missing_integration_id?: string;
      action?: "connect_integration";
    };
  }>;
  role: OrgRole;
}

export function ProjectWorkspace({
  project,
  initialMessages,
  role,
}: ProjectWorkspaceProps) {
  // State
  const [inputValue, setInputValue] = React.useState("");
  const [messages, setMessages] = React.useState<any[]>(initialMessages || []);
  const [buildSteps, setBuildSteps] = React.useState<BuildStep[]>(() =>
    deriveBuildSteps(project?.lifecycle_state ?? null, project?.build_logs ?? null),
  );
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [currentSpec, setCurrentSpec] = React.useState<ToolSpec | null>(project?.spec || null);
  const [toolId, setToolId] = React.useState<string | undefined>(project?.id);
  const [showBuildSteps, setShowBuildSteps] = React.useState(true);
  const [showChat, setShowChat] = React.useState(true);
  const [showVersions, setShowVersions] = React.useState(false);
  const [versionsLoading, setVersionsLoading] = React.useState(false);
  const [versionsError, setVersionsError] = React.useState<string | null>(null);
  const [versions, setVersions] = React.useState<VersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = React.useState<string | null>(null);
  const [promotingVersionId, setPromotingVersionId] = React.useState<string | null>(null);

  // Derived state
  const isZeroState = messages.length === 0;
  const lifecycleState = project?.lifecycle_state ?? (currentSpec as any)?.lifecycle_state ?? null;
  const canRenderTool = Boolean(currentSpec && toolId && lifecycleState === "READY");

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

  const loadVersions = React.useCallback(async () => {
    if (!toolId) return;
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const res = await fetch(`/api/tools/${toolId}/versions`);
      const payload = await res.json();
      if (!res.ok) {
        setVersionsError(payload?.error ?? "Failed to load versions");
        setVersions([]);
        return;
      }
      setVersions(payload.versions ?? []);
      setActiveVersionId(payload.active_version_id ?? null);
      if (!selectedVersionId && payload.versions?.[0]?.id) {
        setSelectedVersionId(payload.versions[0].id);
      }
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "Failed to load versions");
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [toolId, selectedVersionId]);

  const promoteVersion = React.useCallback(
    async (versionId: string) => {
      if (!toolId) return;
      setPromotingVersionId(versionId);
      try {
        const res = await fetch(`/api/tools/${toolId}/versions/${versionId}/promote`, { method: "POST" });
        const payload = await res.json();
        if (!res.ok) {
          setVersionsError(payload?.error ?? "Failed to promote version");
          return;
        }
        setActiveVersionId(versionId);
        const promoted = versions.find((v) => v.id === versionId);
        if (promoted?.tool_spec) {
          setCurrentSpec(promoted.tool_spec);
        }
        await loadVersions();
      } catch (err) {
        setVersionsError(err instanceof Error ? err.message : "Failed to promote version");
      } finally {
        setPromotingVersionId(null);
      }
    },
    [toolId, versions, loadVersions],
  );

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

  React.useEffect(() => {
    if (isExecuting) return;
    if (!project?.lifecycle_state && !project?.build_logs) return;
    setBuildSteps(deriveBuildSteps(project?.lifecycle_state ?? null, project?.build_logs ?? null));
  }, [project?.lifecycle_state, project?.build_logs, isExecuting]);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      {!isZeroState && (
        <header className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-border/50 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex-1" />
          <div className="font-semibold">{headerTitle}</div>
          <div className="flex-1 flex justify-end items-center gap-4">
            {toolId && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setShowVersions(true);
                  void loadVersions();
                }}
              >
                Versions
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowChat((prev) => !prev)}
            >
              {showChat ? "Hide chat" : "Show chat"}
            </Button>
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
            {showChat && (
              <div className="flex h-full w-[360px] flex-col border-r border-border/50">
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
            )}

            <div className="flex h-full flex-1 flex-col bg-muted/5">
              {canRenderTool && toolId && currentSpec ? (
                <ToolRenderer toolId={toolId} spec={currentSpec} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                  {lifecycleState === "AWAITING_CLARIFICATION"
                    ? "Answer the questions in chat to continue building this tool."
                    : lifecycleState && lifecycleState !== "READY"
                      ? "Tool is still building. Check build progress for updates."
                      : "Describe the tool you want to build to see a live preview."}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
      <Dialog open={showVersions} onOpenChange={setShowVersions}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Tool Versions</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
            <ScrollArea className="h-[420px] rounded-md border border-border/60">
              <div className="divide-y divide-border/60">
                {versionsLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading versions…</div>
                ) : versions.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">No versions found.</div>
                ) : (
                  versions.map((version) => {
                    const isActive = activeVersionId === version.id;
                    const isSelected = selectedVersionId === version.id;
                    return (
                      <button
                        key={version.id}
                        className={[
                          "w-full px-4 py-3 text-left text-sm transition",
                          isSelected ? "bg-muted/60" : "hover:bg-muted/40",
                        ].join(" ")}
                        onClick={() => setSelectedVersionId(version.id)}
                        type="button"
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{version.prompt_used}</div>
                          <div className="flex items-center gap-2 text-xs">
                            {version.breaking_change && (
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-700">
                                Breaking
                              </span>
                            )}
                            <span className="rounded-full border border-border/60 px-2 py-0.5">
                              {version.status}
                            </span>
                            {isActive && (
                              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>{new Date(version.created_at).toLocaleString()}</span>
                          <span>Workflows: {version.workflows_count}</span>
                          <span>Triggers: {version.triggers_count}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Integrations: {version.integrations_used.join(", ") || "none"}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
            <div className="flex h-[420px] flex-col rounded-md border border-border/60 p-4">
              {versionsError && (
                <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                  {versionsError}
                </div>
              )}
              {!selectedVersionId ? (
                <div className="text-sm text-muted-foreground">Select a version to view details.</div>
              ) : (
                <VersionDetails
                  version={versions.find((v) => v.id === selectedVersionId) ?? null}
                  canPromote={canEditProjects(role)}
                  isActive={activeVersionId === selectedVersionId}
                  promoting={promotingVersionId === selectedVersionId}
                  onPromote={promoteVersion}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type VersionSummary = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  prompt_used: string;
  integrations_used: string[];
  workflows_count: number;
  triggers_count: number;
  breaking_change: boolean;
  diff: Record<string, any> | null;
  tool_spec: ToolSpec;
};

function VersionDetails({
  version,
  canPromote,
  isActive,
  promoting,
  onPromote,
}: {
  version: VersionSummary | null;
  canPromote: boolean;
  isActive: boolean;
  promoting: boolean;
  onPromote: (id: string) => void;
}) {
  if (!version) {
    return <div className="text-sm text-muted-foreground">Select a version to view details.</div>;
  }
  const diffEntries = formatDiff(version.diff);
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold">{version.prompt_used}</div>
          <div className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString()}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Status: {version.status}</span>
          <span>Workflows: {version.workflows_count}</span>
          <span>Triggers: {version.triggers_count}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Integrations: {version.integrations_used.join(", ") || "none"}
        </div>
      </div>
      <div className="flex-1 overflow-auto rounded-md border border-border/60 p-3 text-xs">
        {diffEntries.length === 0 ? (
          <div className="text-muted-foreground">No spec-level diff available.</div>
        ) : (
          <div className="space-y-2">
            {diffEntries.map((entry) => (
              <div key={entry.label} className="flex items-start justify-between gap-4 border-b border-border/40 pb-2 last:border-b-0">
                <div className="font-medium text-foreground">{entry.label}</div>
                <div className="text-muted-foreground">{entry.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {version.breaking_change ? "Breaking change detected" : "No breaking changes"}
        </div>
        <Button
          size="sm"
          disabled={!canPromote || isActive || promoting}
          onClick={() => onPromote(version.id)}
        >
          {isActive ? "Active" : promoting ? "Promoting…" : "Roll back"}
        </Button>
      </div>
    </div>
  );
}

function formatDiff(diff: Record<string, any> | null) {
  if (!diff) return [];
  const entries: Array<{ label: string; value: string }> = [];
  for (const [key, value] of Object.entries(diff)) {
    if (typeof value === "boolean") {
      if (value) entries.push({ label: key.replace(/_/g, " "), value: "true" });
      continue;
    }
    if (Array.isArray(value) && value.length > 0) {
      entries.push({ label: key.replace(/_/g, " "), value: value.join(", ") });
    }
  }
  return entries;
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

function deriveBuildSteps(
  lifecycleState: ToolLifecycleState | null,
  buildLogs: ToolBuildLog[] | null,
): BuildStep[] {
  const steps = defaultBuildSteps();
  if (!lifecycleState) return steps;
  if (lifecycleState === "READY") return markAllSuccess(steps);

  const order = steps.map((step) => step.id);
  const current = resolveLifecycleStep(lifecycleState);
  if (current.stepId) {
    const currentIndex = order.indexOf(current.stepId);
    steps.forEach((step, index) => {
      if (index < currentIndex) step.status = "success";
      if (index === currentIndex && current.status) step.status = current.status;
    });
  }

  if (Array.isArray(buildLogs)) {
    const stepById = new Map(steps.map((step) => [step.id, step]));
    for (const log of buildLogs) {
      const stepId = resolveLifecycleStep(log.state).stepId;
      if (!stepId) continue;
      const target = stepById.get(stepId);
      if (!target) continue;
      target.logs.push(log.message);
      if (log.level === "error") target.status = "error";
      if (log.level === "warn" && target.status === "pending") target.status = "running";
    }
  }

  return steps;
}

function resolveLifecycleStep(
  lifecycleState: ToolLifecycleState,
): { stepId: string | null; status: BuildStep["status"] | null } {
  if (lifecycleState === "INIT") return { stepId: "intent", status: "pending" };
  if (lifecycleState === "INTENT_PARSED") return { stepId: "entities", status: "running" };
  if (lifecycleState === "AWAITING_CLARIFICATION") return { stepId: "intent", status: "error" };
  if (lifecycleState === "VALIDATING_INTEGRATIONS") return { stepId: "integrations", status: "running" };
  if (lifecycleState === "FETCHING_DATA") return { stepId: "readiness", status: "running" };
  if (lifecycleState === "DATA_READY") return { stepId: "runtime", status: "running" };
  if (lifecycleState === "BUILDING_VIEWS") return { stepId: "views", status: "running" };
  if (lifecycleState === "DEGRADED") return { stepId: "compile", status: "error" };
  return { stepId: null, status: null };
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
