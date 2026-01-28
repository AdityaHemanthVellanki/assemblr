"use client";

import * as React from "react";
import { Loader2, Share } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { ZeroStateView } from "@/components/dashboard/zero-state";
import { BuildProgressPanel, type BuildStep } from "@/components/dashboard/build-progress-panel";
import { sendChatMessage } from "@/app/actions/chat";
import { startOAuthFlow } from "@/app/actions/oauth";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { type ViewSpecPayload } from "@/lib/toolos/spec";
import Image from "next/image";
import { type SnapshotRecords } from "@/lib/toolos/materialization";
import { canEditProjects, type OrgRole } from "@/lib/permissions-shared";
import { type ToolBuildLog } from "@/lib/toolos/build-state-machine";
import { type ToolLifecycleState } from "@/lib/toolos/spec";
import { safeFetch } from "@/lib/api/client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";

import { ProfileButton } from "@/components/profile/profile-button";

interface ProjectWorkspaceProps {
  project?: {
    id: string;
    spec: ToolSpec | null;
    spec_error?: string | null;
    lifecycle_state?: ToolLifecycleState | null;
    build_logs?: ToolBuildLog[] | null;
    status?: string | null;
    error_message?: string | null;
    view_spec?: ViewSpecPayload | null;
    view_ready?: boolean | null;
    data_snapshot?: Record<string, any> | null;
    data_ready?: boolean | null;
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
  initialPrompt?: string | null;
  initialRequiredIntegrations?: string[] | null;
  readOnly?: boolean;
  shareOwnerName?: string | null;
  shareScope?: "all" | "version";
  shareVersionId?: string | null;
}

export function ProjectWorkspace({
  project,
  initialMessages,
  role,
  initialPrompt,
  initialRequiredIntegrations,
  readOnly,
  shareOwnerName,
  shareScope,
  shareVersionId,
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
  const [showChat, setShowChat] = React.useState(!readOnly);
  const [showVersions, setShowVersions] = React.useState(false);
  const [authExpired, setAuthExpired] = React.useState(false);
  const [versionsLoading, setVersionsLoading] = React.useState(false);
  const [versionsError, setVersionsError] = React.useState<string | null>(null);
  const [versions, setVersions] = React.useState<VersionSummary[]>([]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string | null>(null);
  const [activeVersionId, setActiveVersionId] = React.useState<string | null>(null);
  const [promotingVersionId, setPromotingVersionId] = React.useState<string | null>(null);
  const [initError, setInitError] = React.useState<string | null>(
    project?.status === "FAILED" ? project?.error_message ?? "Tool initialization failed." : null
  );
  const [specErrorState, setSpecErrorState] = React.useState<string | null>(
    project?.spec_error ?? null
  );
  const [integrationGateOpen, setIntegrationGateOpen] = React.useState(false);
  const [missingIntegrations, setMissingIntegrations] = React.useState<string[]>([]);
  const [pendingPrompt, setPendingPrompt] = React.useState<string | null>(null);
  const [pendingRequiredIntegrations, setPendingRequiredIntegrations] = React.useState<string[]>([]);
  const [pendingMessageAdded, setPendingMessageAdded] = React.useState(false);
  const pendingRef = React.useRef(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [integrationMode, setIntegrationMode] = React.useState<"auto" | "manual">("auto");
  const [selectedIntegrationIds, setSelectedIntegrationIds] = React.useState<string[]>([]);
  const [integrationPickerOpen, setIntegrationPickerOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [shareScopeState, setShareScopeState] = React.useState<"all" | "version">("all");
  const [shareVersionSelection, setShareVersionSelection] = React.useState<string | null>(null);
  const [shareUrl, setShareUrl] = React.useState<string | null>(null);
  const [shareLoading, setShareLoading] = React.useState(false);
  const [shareError, setShareError] = React.useState<string | null>(null);
  const [isConnecting, setIsConnecting] = React.useState(false);

  // DB-Backed State (Single Source of Truth)
  const [projectStatus, setProjectStatus] = React.useState<string>(project?.status || "DRAFT");
  const [viewReady, setViewReady] = React.useState<boolean>(project?.view_ready ?? false);
  const [viewSpec, setViewSpec] = React.useState<ViewSpecPayload | null>(project?.view_spec ?? null);
  const [dataReady, setDataReady] = React.useState<boolean>(project?.data_ready ?? false);
  const [dataSnapshot, setDataSnapshot] = React.useState<Record<string, any> | null>(project?.data_snapshot ?? null);
  const didPollRef = React.useRef(false);

  // Derived state
  const isZeroState = messages.length === 0;
  // Use DB status for lifecycle state
  
  // FIX: Allow 'ready' status as well
  // We strictly check DB status here. No inferred state.
  const canRenderTool = Boolean(
    toolId &&
      viewReady &&
      viewSpec &&
      (viewSpec.decision?.kind !== "render" || dataSnapshot)
  );

  // Polling for lifecycle status when not ready
  React.useEffect(() => {
    if (!toolId) return;
    didPollRef.current = false;
  }, [toolId]);


  React.useEffect(() => {
    if (!toolId) return;
    if (didPollRef.current) return;
    
    // If already ready, don't poll
    if (canRenderTool) {
      didPollRef.current = true;
      return;
    }
    if (projectStatus === "FAILED") {
      didPollRef.current = true;
      return;
    }
    if (viewReady && dataReady) {
      didPollRef.current = true;
      return;
    }

    const poll = async () => {
        try {
            const res = await safeFetch<any>(`/api/tools/${toolId}/status`);
            
            if (res.data_ready === true && res.view_ready === true) {
                 console.log("[UI] Data ready, stopping polling");
                 setDataReady(true);
                 setViewReady(true);
                 if (res.data_snapshot) setDataSnapshot(res.data_snapshot);
                if (res.view_spec) {
                  const normalized =
                    Array.isArray(res.view_spec) ? { views: res.view_spec } : res.view_spec;
                  setViewSpec(normalized);
                }
                 return;
            }

            // Update local state from DB response
            if (res.status) setProjectStatus(res.status);

            if (res.error) {
                 setInitError(res.error);
            }

            if (res.data_ready === true && res.data_snapshot) {
                 setDataReady(true);
                 setDataSnapshot(res.data_snapshot);
            }

            if (res.view_ready === true && res.view_spec) {
                 const normalized =
                   Array.isArray(res.view_spec) ? { views: res.view_spec } : res.view_spec;
                 setViewReady(true);
                 setViewSpec(normalized);
            }
            
            if (res.data_ready === true && res.view_ready === true) {
                 if (res.status === "FAILED") {
                     setInitError(res.error || "Tool initialization failed.");
                 }
                 return;
            }

            if (res.status === "FAILED") {
                 // Terminal state: failure
                 setInitError(res.error || "Tool initialization failed.");
            }
        } catch (e) {
            console.error("Status poll failed", e);
        }
    };

    didPollRef.current = true;
    void poll();
  }, [toolId, canRenderTool, projectStatus, viewReady, dataReady]);

  // Dynamic Header Title
  const headerTitle =
    (currentSpec as any)?.purpose ||
    (currentSpec as any)?.title ||
    (currentSpec as any)?.name ||
    "New Chat";

  const handleShare = React.useCallback(() => {
    if (!toolId) return;
    setShareOpen(true);
    setShareError(null);
    setShareUrl(null);
    setShareScopeState("all");
    setShareVersionSelection(activeVersionId ?? null);
  }, [toolId, activeVersionId]);

  const generateShareLink = React.useCallback(async () => {
    if (!toolId) return;
    setShareLoading(true);
    setShareError(null);
    try {
      const payload = await safeFetch<{ url: string }>(`/api/tools/${toolId}/share`, {
        method: "POST",
        body: JSON.stringify({
          scope: shareScopeState,
          versionId: shareScopeState === "version" ? shareVersionSelection : null,
        }),
      });
      setShareUrl(payload.url);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Failed to create share link");
    } finally {
      setShareLoading(false);
    }
  }, [toolId, shareScopeState, shareVersionSelection]);

  const loadVersions = React.useCallback(async () => {
    if (!toolId) return;
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const payload = await safeFetch<{
        versions: VersionSummary[];
        active_version_id?: string;
      }>(`/api/tools/${toolId}/versions`);
      setVersions(payload.versions ?? []);
      setActiveVersionId(payload.active_version_id ?? null);
      if (!selectedVersionId && payload.versions?.[0]?.id) {
        setSelectedVersionId(payload.versions[0].id);
      }
      return payload;
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "Failed to load versions");
      setVersions([]);
      return null;
    } finally {
      setVersionsLoading(false);
    }
  }, [toolId, selectedVersionId]);

  React.useEffect(() => {
    if (!shareOpen || !toolId) return;
    void loadVersions();
  }, [shareOpen, toolId, loadVersions]);

  const promoteVersion = React.useCallback(
    async (versionId: string) => {
      if (!toolId) return;
      setPromotingVersionId(versionId);
      try {
        await safeFetch(`/api/tools/${toolId}/versions/${versionId}/promote`, { method: "POST" });
        setActiveVersionId(versionId);
        const promoted = versions.find((v) => v.id === versionId);
        if (promoted?.tool_spec) {
          setCurrentSpec(promoted.tool_spec);
          setSpecErrorState(null);
        }
        if (promoted?.view_spec) {
          setViewSpec(promoted.view_spec);
        }
        if (promoted?.data_snapshot) {
          setDataSnapshot(promoted.data_snapshot);
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

  const handleRollback = React.useCallback(async () => {
    if (!toolId) return;
    const payload = await loadVersions();
    if (!payload || !payload.versions?.length) {
      setVersionsError("No versions available for rollback");
      return;
    }
    const target = payload.versions.find((version) => version.id !== payload.active_version_id);
    if (!target) {
      setVersionsError("No previous version available for rollback");
      return;
    }
    await promoteVersion(target.id);
  }, [toolId, loadVersions, promoteVersion]);

  const handleDeleteTool = React.useCallback(async () => {
    if (!toolId) return;
    try {
      const res = await fetch(`/api/projects/${toolId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Failed to delete tool");
      }
      router.push("/app/chat");
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : "Failed to delete tool");
    }
  }, [toolId, router]);

  const lastUserPrompt = React.useMemo(() => {
    const last = [...messages].reverse().find((message) => message.role === "user");
    return last?.content ?? null;
  }, [messages]);

  const integrationById = React.useMemo(() => {
    const map = new Map<string, (typeof INTEGRATIONS_UI)[number]>();
    INTEGRATIONS_UI.forEach((integration) => {
      map.set(integration.id, integration);
    });
    return map;
  }, []);

  const integrationStorageKey = React.useMemo(
    () => `assemblr:integration-mode:${toolId ?? "new"}`,
    [toolId],
  );

  const selectedIntegrationStorageKey = React.useMemo(
    () => `assemblr:integration-selected:${toolId ?? "new"}`,
    [toolId],
  );

  React.useEffect(() => {
    try {
      const storedMode = localStorage.getItem(integrationStorageKey);
      if (storedMode === "auto" || storedMode === "manual") {
        setIntegrationMode(storedMode);
      }
      const storedSelected = localStorage.getItem(selectedIntegrationStorageKey);
      if (storedSelected) {
        const parsed = JSON.parse(storedSelected);
        if (Array.isArray(parsed)) {
          setSelectedIntegrationIds(parsed.filter((id) => typeof id === "string"));
        }
      }
    } catch {
      return;
    }
  }, [integrationStorageKey, selectedIntegrationStorageKey]);

  React.useEffect(() => {
    try {
      localStorage.setItem(integrationStorageKey, integrationMode);
      localStorage.setItem(selectedIntegrationStorageKey, JSON.stringify(selectedIntegrationIds));
    } catch {
      return;
    }
  }, [integrationMode, selectedIntegrationIds, integrationStorageKey, selectedIntegrationStorageKey]);

  const toggleIntegration = React.useCallback((id: string) => {
    setSelectedIntegrationIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }, []);

  React.useEffect(() => {
    if (shareScope === "version" && shareVersionId) {
      setSelectedVersionId(shareVersionId);
      setActiveVersionId(shareVersionId);
    }
  }, [shareScope, shareVersionId]);

  const storePendingPrompt = React.useCallback((payload: {
    prompt: string;
    requiredIntegrations: string[];
    messageAdded: boolean;
  }) => {
    try {
      localStorage.setItem("assemblr:pending_prompt", JSON.stringify(payload));
    } catch {
      return;
    }
  }, []);

  const clearPendingPrompt = React.useCallback(() => {
    try {
      localStorage.removeItem("assemblr:pending_prompt");
    } catch {
      return;
    }
  }, []);

  const executePrompt = React.useCallback(
    async (
      prompt: string,
      options?: { requiredIntegrations?: string[] | null; skipUserMessage?: boolean },
    ) => {
      if (!prompt.trim() || isExecuting || readOnly) return;

      const shouldAddMessage = !options?.skipUserMessage;
      const history = shouldAddMessage
        ? [...messages, { role: "user", content: prompt }]
        : messages;

      if (shouldAddMessage) {
        setMessages(history);
      }
      setInputValue("");
      setIsExecuting(true);
      setBuildSteps(markFirstRunning(defaultBuildSteps()));
      setAuthExpired(false);
      setViewReady(false);
      setViewSpec(null);
      setDataReady(false);
      setDataSnapshot(null);

      try {
        const response = await sendChatMessage(
          toolId,
          prompt,
          history.map((m) => ({ role: m.role, content: m.content })),
          currentSpec,
          options?.requiredIntegrations ?? undefined,
          integrationMode,
          integrationMode === "manual" ? selectedIntegrationIds : undefined,
        );
        if ("integrationMismatch" in response && response.integrationMismatch) {
          setIsExecuting(false);
          setBuildSteps(defaultBuildSteps());
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: response.message ?? "This integration doesn’t support this action. Try switching integrations." },
          ]);
          return;
        }
        if ("requiresIntegrations" in response && response.requiresIntegrations) {
          setIsExecuting(false);
          setBuildSteps(defaultBuildSteps());
          setIntegrationGateOpen(true);
          setMissingIntegrations(response.missingIntegrations ?? []);
          setPendingPrompt(prompt);
          setPendingRequiredIntegrations(response.requiredIntegrations ?? []);
          setPendingMessageAdded(shouldAddMessage);
          storePendingPrompt({
            prompt,
            requiredIntegrations: response.requiredIntegrations ?? [],
            messageAdded: shouldAddMessage,
          });
          return;
        }
        if ("requiresAuth" in response && response.requiresAuth) {
          setAuthExpired(true);
          setMessages((prev) => [...prev, { role: "assistant", content: "Session expired — reauth required." }]);
          setBuildSteps(markError(defaultBuildSteps(), "Session expired — reauth required."));
          return;
        }
        if ("error" in response && response.error) {
          throw new Error(response.error);
        }
        const data = response as {
          toolId?: string;
          message: { content: string };
          spec?: ToolSpec;
          metadata?: Record<string, any>;
        };

        if (data.toolId && !toolId) {
          setToolId(data.toolId);
          if (pathname === "/app/chat") {
            router.replace(`/dashboard/projects/${data.toolId}`);
          }
        }

        const pipelineSteps = data.metadata?.build_steps as BuildStep[] | undefined;
        if (pipelineSteps && pipelineSteps.length > 0) {
          setBuildSteps(pipelineSteps);
        } else {
          setBuildSteps(markAllSuccess(defaultBuildSteps()));
        }

        if (data.spec) {
          setCurrentSpec(data.spec as ToolSpec);
          setSpecErrorState(null);
        }

        const assistantMsg = {
          role: "assistant",
          content: data.message.content,
        };
        const refinements = data.metadata?.refinements as string[] | undefined;
        if (refinements && refinements.length > 0) {
          const refinementMsg = {
            role: "assistant",
            content: `Optional refinements:\n${refinements.map((r, i) => `${i + 1}. ${r}`).join("\n")}`,
          };
          setMessages((prev) => [...prev, assistantMsg, refinementMsg]);
        } else {
          setMessages((prev) => [...prev, assistantMsg]);
        }
      } catch (e) {
        console.error(e);
        const errorMsg = { role: "assistant", content: "Something went wrong. Please try again." };
        setMessages((prev) => [...prev, errorMsg]);
        setBuildSteps(markError(defaultBuildSteps(), e instanceof Error ? e.message : String(e)));
      } finally {
        setIsExecuting(false);
      }
    },
    [
      isExecuting,
      messages,
      toolId,
      currentSpec,
      storePendingPrompt,
      integrationMode,
      selectedIntegrationIds,
      readOnly,
      pathname,
      router,
    ],
  );

  const handleSubmit = async () => {
    if (!inputValue.trim() || isExecuting || readOnly) return;
    await executePrompt(inputValue);
  };

  const handleConnectMissing = React.useCallback(async () => {
    if (!pendingPrompt || missingIntegrations.length === 0) return;
    const integrationId = missingIntegrations[0];
    
    setIsConnecting(true);
    
    storePendingPrompt({
      prompt: pendingPrompt,
      requiredIntegrations: pendingRequiredIntegrations,
      messageAdded: pendingMessageAdded,
    });
    
    try {
      const oauthUrl = await startOAuthFlow({
        providerId: integrationId,
        projectId: project?.id,
        chatId: toolId,
        toolId: toolId,
        currentPath: window.location.pathname + window.location.search,
        prompt: pendingPrompt,
        integrationMode: integrationMode,
        pendingIntegrations: pendingRequiredIntegrations,
        blockedIntegration: integrationId
      });

      window.location.href = oauthUrl;
    } catch (err) {
      console.error("Failed to start OAuth flow", err);
      setIsConnecting(false);
      // Optionally show an error message or toast here
    }
  }, [
    missingIntegrations,
    pendingPrompt,
    pendingRequiredIntegrations,
    pendingMessageAdded,
    storePendingPrompt,
    project?.id,
    toolId,
    integrationMode
  ]);

  React.useEffect(() => {
    if (pendingRef.current) return;
    if (readOnly) return;
    if (!initialPrompt) return;
    pendingRef.current = true;
    void executePrompt(initialPrompt, {
      requiredIntegrations: initialRequiredIntegrations ?? undefined,
    });
    if (pathname) router.replace(pathname);
  }, [initialPrompt, initialRequiredIntegrations, executePrompt, pathname, router, readOnly]);

  React.useEffect(() => {
    const connected = searchParams.get("integration_connected");
    if (connected !== "true") return;
    let pending: { prompt: string; requiredIntegrations: string[]; messageAdded: boolean } | null = null;
    try {
      const raw = localStorage.getItem("assemblr:pending_prompt");
      if (raw) pending = JSON.parse(raw);
    } catch {
      pending = null;
    }
    if (pending?.prompt) {
      clearPendingPrompt();
      setIntegrationGateOpen(false);
      setMissingIntegrations([]);
      setPendingPrompt(null);
      setPendingRequiredIntegrations([]);
      setPendingMessageAdded(pending.messageAdded);
      void executePrompt(pending.prompt, {
        requiredIntegrations: pending.requiredIntegrations,
        skipUserMessage: pending.messageAdded,
      });
    }
    if (pathname) router.replace(pathname);
  }, [searchParams, executePrompt, pathname, router, clearPendingPrompt]);

  React.useEffect(() => {
    if (isExecuting) return;
    if (!project?.lifecycle_state && !project?.build_logs) return;
    setBuildSteps(deriveBuildSteps(project?.lifecycle_state ?? null, project?.build_logs ?? null));
  }, [project?.lifecycle_state, project?.build_logs, isExecuting]);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {isConnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">Connecting integration... you’ll be returned automatically.</p>
          </div>
        </div>
      )}
      {authExpired && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-6 py-2 text-xs text-red-700">
          Session expired — reauth required.
        </div>
      )}
      {shareOwnerName && (
        <div className="border-b border-border/60 bg-muted/20 px-6 py-2 text-xs text-muted-foreground">
          {shareOwnerName} shared this tool with you.
        </div>
      )}
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-border/50 bg-background/50 backdrop-blur-sm z-10">
        <div className="flex-1" />
        <div className="font-semibold">{headerTitle}</div>
        <div className="flex-1 flex justify-end items-center gap-4">
          {!isZeroState && toolId && shareScope !== "version" && (
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
          {!isZeroState && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowChat((prev) => !prev)}
            >
              {showChat ? "Hide chat" : "Show chat"}
            </Button>
          )}
          {!isZeroState && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              onClick={handleShare}
            >
              <Share className="h-4 w-4" />
              Share
            </Button>
          )}
          <ProfileButton />
        </div>
      </header>

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
                  {readOnly ? (
                    <div className="text-xs text-muted-foreground">Read-only view.</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">Integration mode</div>
                        <div className="inline-flex items-center rounded-full border border-border/60 bg-muted/30 p-0.5 text-xs">
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1 ${integrationMode === "auto" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                            onClick={() => setIntegrationMode("auto")}
                          >
                            Auto
                          </button>
                          <button
                            type="button"
                            className={`rounded-full px-3 py-1 ${integrationMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                            onClick={() => setIntegrationMode("manual")}
                          >
                            Manual
                          </button>
                        </div>
                      </div>
                      {integrationMode === "manual" && (
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedIntegrationIds.map((id) => {
                            const integration = integrationById.get(id);
                            return (
                              <button
                                key={id}
                                type="button"
                                onClick={() => toggleIntegration(id)}
                                className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/20 px-2 py-1 text-xs text-muted-foreground"
                              >
                                {integration?.logoUrl ? (
                                  <Image
                                    src={integration.logoUrl}
                                    alt={integration.name}
                                    width={16}
                                    height={16}
                                    className="h-4 w-4 rounded"
                                  />
                                ) : null}
                                <span>{integration?.name ?? id}</span>
                              </button>
                            );
                          })}
                          <div className="relative">
                            <button
                              type="button"
                              className="rounded-full border border-dashed border-border/60 px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40"
                              onClick={() => setIntegrationPickerOpen((prev) => !prev)}
                            >
                              Add integration
                            </button>
                            {integrationPickerOpen && (
                              <div className="absolute bottom-full left-0 z-50 mb-2 w-48 rounded-md border border-border/60 bg-popover p-1 shadow-md">
                                {INTEGRATIONS_UI.map((integration) => {
                                  const isSelected = selectedIntegrationIds.includes(integration.id);
                                  return (
                                    <button
                                      key={integration.id}
                                      type="button"
                                      className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent ${isSelected ? "bg-accent/50" : ""}`}
                                      onClick={() => {
                                        toggleIntegration(integration.id);
                                        setIntegrationPickerOpen(false);
                                      }}
                                    >
                                      <span>{integration.name}</span>
                                      {isSelected ? <span>✓</span> : null}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      <PromptBar
                        value={inputValue}
                        onChange={setInputValue}
                        onSubmit={handleSubmit}
                        className="shadow-lg"
                        isLoading={isExecuting}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex h-full flex-1 flex-col bg-muted/5">
              {specErrorState || projectStatus === "CORRUPTED" ? (
                <div className="flex h-full items-center justify-center px-6 text-sm">
                  <div className="max-w-xl rounded-md border border-red-200 bg-red-50 p-6 text-red-700">
                    <div className="text-base font-semibold">
                      This tool failed to load due to an invalid spec.
                    </div>
                    <div className="mt-2 text-xs text-red-700/80">
                      {specErrorState ?? "Tool spec is corrupted or out of date."}
                    </div>
                    {!readOnly && (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Button
                          onClick={() => {
                            if (lastUserPrompt) {
                              void executePrompt(lastUserPrompt, { skipUserMessage: true });
                            }
                          }}
                          disabled={!lastUserPrompt || isExecuting}
                        >
                          Retry regeneration
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleRollback}
                          disabled={versionsLoading || promotingVersionId !== null}
                        >
                          Roll back to previous version
                        </Button>
                        <Button variant="destructive" onClick={handleDeleteTool}>
                          Delete tool
                        </Button>
                      </div>
                    )}
                    {readOnly && (
                      <div className="mt-4 text-xs text-red-700/80">
                        Recovery actions are unavailable in read-only mode.
                      </div>
                    )}
                  </div>
                </div>
              ) : canRenderTool && viewSpec ? (
                <ToolViewRenderer viewSpec={viewSpec} dataSnapshot={dataSnapshot} />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
                  {initError || projectStatus === "FAILED" ? (
                    <div className="text-red-600 font-medium bg-red-50 p-4 rounded-md border border-red-200">
                      {initError || "Tool failed. Please try again."}
                    </div>
                  ) : projectStatus === "BUILDING" || projectStatus === "COMPILING" ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Fetching data…
                    </div>
                  ) : projectStatus === "MATERIALIZED" ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rendering output…
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Fetching data…
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
      <Dialog open={integrationGateOpen} onOpenChange={setIntegrationGateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Connect integrations to continue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>
              Assemblr needs the following integrations to run this request. Connect them to proceed.
            </div>
            <div className="space-y-2">
              {missingIntegrations.map((integrationId) => {
                const integration = integrationById.get(integrationId);
                return (
                  <div
                    key={integrationId}
                    className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      {integration?.logoUrl ? (
                        <Image
                          src={integration.logoUrl}
                          alt={integration.name}
                          width={20}
                          height={20}
                          className="h-5 w-5 rounded"
                        />
                      ) : null}
                      <span className="text-foreground/90">{integration?.name ?? integrationId}</span>
                    </div>
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      Required
                    </span>
                  </div>
                );
              })}
            </div>
            <Button
              onClick={handleConnectMissing}
              disabled={!pendingPrompt || missingIntegrations.length === 0}
            >
              Connect & Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Share tool</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground">
            <div>Anyone with this link can access this tool.</div>
            <div className="space-y-2">
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 ${shareScopeState === "all" ? "bg-muted/30 text-foreground" : "bg-background"}`}
                onClick={() => setShareScopeState("all")}
              >
                <span className="font-medium">Share entire tool</span>
                {shareScopeState === "all" ? <span>Selected</span> : null}
              </button>
              <button
                type="button"
                className={`flex w-full items-center justify-between rounded-md border border-border/60 px-3 py-2 ${shareScopeState === "version" ? "bg-muted/30 text-foreground" : "bg-background"}`}
                onClick={() => setShareScopeState("version")}
              >
                <span className="font-medium">Share a specific version</span>
                {shareScopeState === "version" ? <span>Selected</span> : null}
              </button>
            </div>
            {shareScopeState === "version" && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Choose a version</div>
                <div className="flex flex-col gap-2">
                  {versions.map((version) => (
                    <button
                      key={version.id}
                      type="button"
                      className={`flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-xs ${shareVersionSelection === version.id ? "bg-muted/30 text-foreground" : "bg-background"}`}
                      onClick={() => setShareVersionSelection(version.id)}
                    >
                      <span className="truncate">{version.prompt_used}</span>
                      <span>{new Date(version.created_at).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {shareError ? (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
                {shareError}
              </div>
            ) : null}
            {shareUrl ? (
              <div className="space-y-2">
                <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
                  {shareUrl}
                </div>
                <Button
                  type="button"
                  onClick={async () => {
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(shareUrl);
                    }
                  }}
                >
                  Copy link
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                onClick={generateShareLink}
                disabled={shareLoading || (shareScopeState === "version" && !shareVersionSelection)}
              >
                {shareLoading ? "Generating…" : "Generate link"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
                  canPromote={canEditProjects(role) && !readOnly}
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
  tool_spec: ToolSpec | null;
  view_spec?: ViewSpecPayload | null;
  data_snapshot?: Record<string, any> | null;
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

function ToolViewRenderer({
  viewSpec,
  dataSnapshot,
}: {
  viewSpec: ViewSpecPayload;
  dataSnapshot: Record<string, any> | null;
}) {
  const records = resolveSnapshotRecords(dataSnapshot ?? null);
  const state = records.state ?? {};
  const views = Array.isArray(viewSpec.views) ? viewSpec.views : [];
  const answerContract = viewSpec.answer_contract;
  const decision = viewSpec.decision;
  const assumptions = Array.isArray(viewSpec.assumptions) ? viewSpec.assumptions : [];
  const slackStatus = viewSpec.integration_statuses?.slack;
  const slackBanner =
    slackStatus?.status === "reauth_required" ? (
      <div className="rounded-lg border border-border/60 bg-background px-4 py-4 text-sm">
        <div className="mb-3">Slack needs to be reconnected to continue.</div>
        <Button asChild size="sm">
          <Link href="/dashboard/integrations">Reconnect Slack</Link>
        </Button>
      </div>
    ) : null;
  const assumptionsBanner =
    assumptions.length > 0 ? (
      <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-4 text-sm">
        <div className="mb-2 text-xs uppercase text-muted-foreground">Assumptions applied</div>
        <div className="space-y-2">
          {assumptions.map((assumption) => (
            <div key={`${assumption.field}-${assumption.reason}`} className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">{assumption.field}</span>
              <span>{assumption.reason}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null;
  if (decision?.kind === "ask") {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border/60 px-6 py-4">
          <div className="text-xs uppercase text-muted-foreground">Clarification</div>
          <div className="text-lg font-semibold">Needs more detail</div>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {slackBanner}
          {assumptionsBanner}
          <div className="rounded-lg border border-border/60 bg-background px-4 py-6 text-sm">
            {decision.question ?? "Please clarify your request to continue."}
          </div>
        </div>
      </div>
    );
  }
  if (decision?.kind === "explain") {
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="border-b border-border/60 px-6 py-4">
          <div className="text-xs uppercase text-muted-foreground">Explanation</div>
          <div className="text-lg font-semibold">No results</div>
        </div>
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {slackBanner}
          {assumptionsBanner}
          <div className="rounded-lg border border-border/60 bg-background px-4 py-6 text-sm">
            {decision.explanation ?? "No results found for the requested goal."}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-border/60 px-6 py-4">
        <div className="text-xs uppercase text-muted-foreground">Output</div>
        <div className="text-lg font-semibold">Result</div>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {slackBanner}
        {assumptionsBanner}
        {decision?.partial && decision.explanation && (
          <div className="rounded-lg border border-border/60 bg-background px-4 py-4 text-sm">
            {decision.explanation}
          </div>
        )}
        {views.map((view) => {
          const data = resolveStatePath(state, view.source.statePath);
          const rows = normalizeRows(data);
          return (
            <div key={view.id} className="rounded-lg border border-border/60 bg-background">
              <div className="border-b border-border/60 px-4 py-3 text-sm font-medium">{view.name}</div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      {view.fields.map((field) => (
                        <th key={field} className="px-4 py-2 text-left font-medium">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={`${view.id}-${index}`} className="border-t border-border/60">
                        {view.fields.map((field) => (
                          <td key={`${view.id}-${index}-${field}`} className="px-4 py-2 align-top">
                            {formatCell(row?.[field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="px-4 py-6 text-sm text-muted-foreground">
                    {viewSpec.goal_plan?.primary_goal
                      ? `No results for ${viewSpec.goal_plan.primary_goal}.`
                      : answerContract?.required_constraints?.[0]
                      ? `No ${answerContract.entity_type}s found related to "${answerContract.required_constraints[0].value}".`
                      : "No results."}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function normalizeRows(data: any): Array<Record<string, any>> {
  if (Array.isArray(data)) {
    return data.map((row) => normalizeGmailRow(row) ?? row);
  }
  if (data && typeof data === "object") {
    return Object.values(data)
      .filter((value) => value && typeof value === "object")
      .map((row) => normalizeGmailRow(row) ?? row) as Array<Record<string, any>>;
  }
  return [];
}

function normalizeGmailRow(row: any): Record<string, any> | null {
  const headers = Array.isArray(row?.payload?.headers) ? row.payload.headers : [];
  if (headers.length === 0) return null;
  const findHeader = (name: string) =>
    headers.find((h: any) => String(h?.name ?? "").toLowerCase() === name.toLowerCase())?.value ?? "";
  const dateValue = findHeader("date");
  const internalDate = row?.internalDate ? new Date(Number(row.internalDate)).toISOString() : "";
  return {
    from: findHeader("from"),
    subject: findHeader("subject"),
    snippet: row?.snippet ?? "",
    date: dateValue || internalDate,
  };
}

function formatCell(value: any) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function resolveStatePath(state: Record<string, any>, path: string) {
  const parts = path.split(".");
  let current: any = state;
  for (const part of parts) {
    if (current == null) return null;
    current = current[part];
  }
  return current ?? null;
}

function resolveSnapshotRecords(snapshot: Record<string, any> | null | undefined): SnapshotRecords {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    "state" in snapshot &&
    "actions" in snapshot &&
    "integrations" in snapshot
  ) {
    const cast = snapshot as SnapshotRecords;
    return {
      state: typeof cast.state === "object" && cast.state ? cast.state : {},
      actions: typeof cast.actions === "object" && cast.actions ? cast.actions : {},
      integrations: typeof cast.integrations === "object" && cast.integrations ? cast.integrations : {},
    };
  }
  return { state: {}, actions: {}, integrations: {} };
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
    { id: "runtime", title: "Fetching data", status: "pending", logs: [] },
    { id: "views", title: "Rendering output", status: "pending", logs: [] },
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
  lifecycleState: string,
): { stepId: string | null; status: BuildStep["status"] | null } {
  // Map canonical lifecycle to UI steps
  if (lifecycleState === "DRAFT") return { stepId: "intent", status: "pending" };
  if (lifecycleState === "BUILDING") return { stepId: "compile", status: "running" };
  if (lifecycleState === "READY") return { stepId: "views", status: "success" };
  
  // Map granular build states to UI steps
  if (lifecycleState === "INTENT_PARSED") return { stepId: "intent", status: "success" };
  if (lifecycleState === "ENTITIES_EXTRACTED") return { stepId: "entities", status: "success" };
  if (lifecycleState === "INTEGRATIONS_RESOLVED") return { stepId: "integrations", status: "success" };
  if (lifecycleState === "ACTIONS_DEFINED") return { stepId: "actions", status: "success" };
  if (lifecycleState === "WORKFLOWS_COMPILED") return { stepId: "workflows", status: "success" };
  if (lifecycleState === "RUNTIME_READY") return { stepId: "compile", status: "success" };
  if (lifecycleState === "DATA_FETCHED") return { stepId: "runtime", status: "success" };

  // Legacy mappings (cleanup)
  // if (lifecycleState === "COMPILING") return { stepId: "compile", status: "running" };
  // if (lifecycleState === "MATERIALIZED") return { stepId: "views", status: "success" };
  // if (lifecycleState === "ACTIVE") return { stepId: "views", status: "success" };
  
  if (lifecycleState === "FAILED") {
    return { stepId: "compile", status: "error" };
  }
  
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
