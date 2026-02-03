"use client";

import * as React from "react";
import { Send, ChevronDown, Plus, X, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ToolSpec } from "@/lib/spec/toolSpec";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";
import { safeFetch, ApiError } from "@/lib/api/client";

import { startOAuthFlow } from "@/app/actions/oauth";

type IntegrationCTA = {
  id: string;
  name?: string;
  logoUrl?: string;
  connected?: boolean;
  label?: string;
  action?: string;
};

type IntegrationConnectionStatus =
  | "connected"
  | "not_connected"
  | "connecting"
  | "error";

type RawMessage = {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown> | null;
};

type Message =
  | { role: "user" | "assistant"; type: "text"; content: string; progress?: any[] }
  | { role: "assistant"; type: "integration_action"; integrations: IntegrationCTA[] }
  | { role: "assistant"; type: "data"; result: { result_type: "list" | "table" | "json" | "text"; rows?: any[]; object?: Record<string, any>; summary?: string } };

interface ChatPanelProps {
  toolId: string;
  initialMessages?: RawMessage[];
  onSpecUpdate: (spec: ToolSpec) => void;
}

export function ChatPanel({ toolId, initialMessages = [], onSpecUpdate }: ChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>(() => {
    return initialMessages.map((m) => {
      const meta = m.metadata ?? undefined;
      let progress: any[] | undefined;
      
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const rec = meta as Record<string, unknown>;
        if (Array.isArray(rec.progress)) {
            progress = rec.progress;
        }

        const type = rec.type;
        const integrations = rec.integrations;
        if (type === "integration_action" && Array.isArray(integrations)) {
          const parsed = integrations.flatMap((raw): IntegrationCTA[] => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
            const r = raw as Record<string, unknown>;
            const id = typeof r.id === "string" ? r.id : "";
            if (!id) return [];
            const cta: IntegrationCTA = { id };
            if (typeof r.name === "string") cta.name = r.name;
            if (typeof r.logoUrl === "string") cta.logoUrl = r.logoUrl;
            if (typeof r.connected === "boolean") cta.connected = r.connected;
            if (typeof r.label === "string") cta.label = r.label;
            if (typeof r.action === "string") cta.action = r.action;
            return [cta];
          });
          if (parsed.length > 0) {
            return { role: "assistant", type: "integration_action", integrations: parsed };
          }
        }

        const action = rec.action;
        const missingId = rec.missing_integration_id;
        if (action === "connect_integration" && typeof missingId === "string") {
          return {
            role: "assistant",
            type: "integration_action",
            integrations: [{ id: missingId, label: `Connect ${missingId}` }],
          };
        }
      }
      return { role: m.role, type: "text", content: m.content, progress };
    });
  });
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [authExpired, setAuthExpired] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Integration Mode State
  const [integrationMode, setIntegrationMode] = React.useState<"auto" | "manual">("auto");
  const [selectedIntegrationIds, setSelectedIntegrationIds] = React.useState<string[]>([]);
  const [integrationStatuses, setIntegrationStatuses] = React.useState<Record<string, IntegrationConnectionStatus> | null>(null);
  const [isModeOpen, setIsModeOpen] = React.useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = React.useState(false);
  const [requestMode, setRequestMode] = React.useState<"create" | "chat">("create");
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [lastExecutionId, setLastExecutionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    async function fetchStatuses() {
      try {
        const data = await safeFetch<{ integrations?: { id: string; connected: boolean }[] }>(
          "/api/integrations",
        );
        if (mounted && data.integrations && Array.isArray(data.integrations)) {
          const map: Record<string, IntegrationConnectionStatus> = {};
          data.integrations.forEach((i) => {
            map[i.id] = i.connected ? "connected" : "not_connected";
          });
          setIntegrationStatuses(map);
        }
      } catch {
        if (mounted) setIntegrationStatuses(null);
      }
    }

    fetchStatuses();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    // We assume the provider ID is passed back if possible, or we might need to guess/ignore.
    // Ideally, the oauth callback redirect should include ?provider=github&error=...
    // The current oauth callback logic handles the redirect.
    // If we don't have provider, we can't map it.
    const provider = params.get("provider");
    if (error && provider) {
      setIntegrationStatuses((prev) => ({
        ...(prev || {}),
        [provider]: "error",
      }));
    }

    if (params.get("integration_connected") === "true") {
      const resumeId = params.get("resumeId");

      // Clear the param to prevent re-submission on refresh
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);

      if (resumeId) {
        setIsLoading(true);
        safeFetch<{
          message?: { type: string; content?: string; integrations?: any[]; result?: any };
          explanation?: string;
          spec?: ToolSpec;
          metadata?: Record<string, any>;
        }>(`/api/tools/${toolId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeId }),
        })
          .then((data) => {
            const message = data?.message;
            if (message?.type === "integration_action" && Array.isArray(message.integrations)) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", type: "integration_action", integrations: message.integrations as IntegrationCTA[] },
              ]);
            } else if (message?.type === "data" && message.result) {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", type: "data", result: message.result },
              ]);
            } else {
              const content =
                message?.type === "text" && typeof message.content === "string"
                  ? message.content
                  : typeof data?.explanation === "string"
                    ? data.explanation
                    : "";
              setMessages((prev) => [...prev, { role: "assistant", type: "text", content }]);
            }
            if (data?.metadata?.executionId) {
              setLastExecutionId(data.metadata.executionId);
            }
            if (data?.spec) {
              onSpecUpdate(data.spec);
            }
            if (data?.metadata?.chatTitle) {
              window.dispatchEvent(new CustomEvent("projects:refresh"));
            }
          })
          .catch((error) => {
            if (error instanceof ApiError && error.status === 401) {
              setAuthExpired(true);
              setMessages((prev) => [
                ...prev,
                { role: "assistant", type: "text", content: "Session expired — reauth required." },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", type: "text", content: "Sorry, something went wrong. Please try again." },
              ]);
            }
          })
          .finally(() => {
            setIsLoading(false);
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  React.useEffect(() => {
    const storedMode = sessionStorage.getItem("integrationMode");
    if (storedMode === "manual") setIntegrationMode("manual");
    const storedRequestMode = sessionStorage.getItem("requestMode");
    if (storedRequestMode === "chat") setRequestMode("chat");

    const storedIds = sessionStorage.getItem("selectedIntegrationIds");
    if (storedIds) {
      try {
        const parsed = JSON.parse(storedIds);
        if (Array.isArray(parsed)) {
          setSelectedIntegrationIds(parsed);
        }
      } catch {}
    }
  }, []);

  React.useEffect(() => {
    sessionStorage.setItem("integrationMode", integrationMode);
  }, [integrationMode]);
  React.useEffect(() => {
    sessionStorage.setItem("requestMode", requestMode);
  }, [requestMode]);

  React.useEffect(() => {
    sessionStorage.setItem("selectedIntegrationIds", JSON.stringify(selectedIntegrationIds));
  }, [selectedIntegrationIds]);

  React.useEffect(() => {
    const savedInput = sessionStorage.getItem("chatInput");
    if (savedInput) setInput(savedInput);
  }, []);

  React.useEffect(() => {
    sessionStorage.setItem("chatInput", input);
  }, [input]);

  async function submitMessage(
    text: string,
    modeOverride?: "auto" | "manual",
    selectionOverride?: string[]
  ) {
    if (!text.trim() || isLoading) return;

    const userMessage = text.trim();
    const effectiveMode = modeOverride ?? integrationMode;
    const effectiveSelection = selectionOverride ?? selectedIntegrationIds;

    setInput(""); // This will trigger the useEffect to clear sessionStorage
    setMessages((prev) => [...prev, { role: "user", type: "text", content: userMessage }]);
    setIsLoading(true);
    setAuthExpired(false);

    try {
      const data = await safeFetch<{
        message?: { type: string; content?: string; integrations?: any[]; result?: any };
        explanation?: string;
        spec?: ToolSpec;
        metadata?: Record<string, any>;
      }>(`/api/tools/${toolId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          mode: requestMode,
          integrationMode: effectiveMode,
          selectedIntegrations:
            effectiveMode === "manual"
              ? effectiveSelection.map((id) => ({
                  id,
                  status: (integrationStatuses && integrationStatuses[id]) || "not_connected",
                }))
              : undefined,
        }),
      });

      const message = data?.message;
      if (message?.type === "integration_action" && Array.isArray(message.integrations)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "integration_action", integrations: message.integrations as IntegrationCTA[] },
        ]);
      } else if (message?.type === "data" && message.result) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "data", result: message.result },
        ]);
      } else {
        const content =
          message?.type === "text" && typeof message.content === "string"
            ? message.content
            : typeof data?.explanation === "string"
              ? data.explanation
              : "";
        setMessages((prev) => [...prev, { role: "assistant", type: "text", content }]);
      }
      
      if (data.spec) {
        onSpecUpdate(data.spec);
      }
      if (data?.metadata?.executionId) {
        setLastExecutionId(data.metadata.executionId);
      }
      if (data?.metadata?.chatTitle) {
        window.dispatchEvent(new CustomEvent("projects:refresh"));
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuthExpired(true);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "text", content: "Session expired — reauth required." },
        ]);
      } else {
        console.error(error);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "text", content: "Sorry, something went wrong. Please try again." },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitMessage(input);
  }


  async function handleActionClick(cta: IntegrationCTA) {
    if (cta.action === "ui:select_integration") {
      if (!selectedIntegrationIds.includes(cta.id)) {
        setSelectedIntegrationIds((prev) => [...prev, cta.id]);
      }
    } else {
      // Set connecting state
      setIntegrationStatuses((prev) => ({
        ...prev,
        [cta.id]: "connecting",
      }));
      setIsConnecting(true);

      try {
        // 1. Capture context and use startOAuthFlow
        // Find the last user message to use as the original prompt
        const lastUserMessage = [...messages].reverse().find((m) => m.role === "user" && m.type === "text");
        const promptContent = lastUserMessage && lastUserMessage.type === "text" ? lastUserMessage.content : "";

        const oauthUrl = await startOAuthFlow({
          providerId: cta.id,
          chatId: toolId, // toolId is used as chat identifier in this context
          toolId: toolId,
          executionId: lastExecutionId ?? undefined,
          currentPath: window.location.pathname + window.location.search,
          prompt: promptContent,
          integrationMode: integrationMode,
          blockedIntegration: cta.id
        });

        router.push(oauthUrl);

      } catch (err) {
        console.error("Connection failed", err);
        setIntegrationStatuses((prev) => ({
          ...prev,
          [cta.id]: "error",
        }));
        setIsConnecting(false);
      }
    }
  }

  // Poll for schema refresh when an integration connects
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("integration_connected") === "true") {
      // Trigger schema refresh
      // We can just call the server action if we exposed it to client,
      // but typically we'd do this on the callback route.
      // However, to be safe, let's trigger it here or assume the callback did it.
      // The callback route doesn't currently call refreshSchemas.
      // We should probably add it there.
      // But for now, let's assume the user might need to click "Refresh Data" if it's not auto.
      // Actually, PART 3 says "Schemas must be discovered: On integration connect".
      // This is best done in the callback route.
    }
  }, []);

  function toggleIntegration(id: string) {
    setSelectedIntegrationIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  return (
    <div className="flex h-full flex-col border-r bg-muted/10">
      {isConnecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg font-medium">Connecting integration... you’ll be returned automatically.</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">Assemblr AI</h2>
          <p className="text-xs text-muted-foreground">Build your tool with chat</p>
          <div className="ml-2 flex items-center gap-1 rounded-md border bg-background p-1">
            <button
              className={cn(
                "rounded-sm px-2 py-1 text-xs",
                requestMode === "create" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              onClick={() => setRequestMode("create")}
            >
              Create
            </button>
            <button
              className={cn(
                "rounded-sm px-2 py-1 text-xs",
                requestMode === "chat" ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
              onClick={() => setRequestMode("chat")}
            >
              Chat
            </button>
          </div>
        </div>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 text-xs font-medium"
            onClick={() => setIsModeOpen(!isModeOpen)}
          >
            {integrationMode === "auto" ? "Auto" : "Manual"}
            <ChevronDown className="h-3 w-3" />
          </Button>
          {isModeOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border bg-popover p-1 shadow-md">
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground",
                  integrationMode === "auto" && "bg-accent/50"
                )}
                onClick={() => {
                  setIntegrationMode("auto");
                  setIsModeOpen(false);
                }}
              >
                Auto (Recommended)
                {integrationMode === "auto" && <Check className="h-3 w-3" />}
              </button>
              <button
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground",
                  integrationMode === "manual" && "bg-accent/50"
                )}
                onClick={() => {
                  setIntegrationMode("manual");
                  setIsModeOpen(false);
                }}
              >
                Manual
                {integrationMode === "manual" && <Check className="h-3 w-3" />}
              </button>
            </div>
          )}
        </div>
      </div>
      {authExpired && (
        <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-700">
          Session expired — reauth required.
        </div>
      )}

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex w-max max-w-[80%] flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted"
              )}
            >
              {msg.type === "text" ? (
                <div>
                    {msg.content}
                    {msg.progress && msg.progress.length > 0 && (
                        <div className="mt-3 space-y-1 rounded-md border border-border/50 bg-background/50 p-2 text-xs">
                            <div className="mb-1 font-semibold opacity-70">Build Log</div>
                            {msg.progress.map((step, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <div className={cn(
                                        "h-1.5 w-1.5 rounded-full",
                                        step.status === "completed" ? "bg-green-500" :
                                        step.status === "started" ? "bg-blue-500 animate-pulse" :
                                        step.status === "waiting_for_user" ? "bg-yellow-500" : "bg-red-500"
                                    )} />
                                    <span className="opacity-80">{step.message}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
              ) : msg.type === "data" ? (
                <div className="space-y-2">
                  {msg.result.summary ? (
                    <div className="text-xs font-medium text-muted-foreground">{msg.result.summary}</div>
                  ) : null}
                  {(msg.result.result_type === "list" || msg.result.result_type === "table") && Array.isArray(msg.result.rows) ? (
                    <ul className="list-disc pl-4">
                      {msg.result.rows.slice(0, 10).map((row, idx) => {
                        const r = row as Record<string, any>;
                        const line = Object.entries(r)
                          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
                          .join(", ");
                        return <li key={idx} className="text-sm">{line}</li>;
                      })}
                    </ul>
                  ) : msg.result.result_type === "json" ? (
                    <pre className="max-w-[520px] overflow-auto rounded-md border border-border bg-background p-2 text-xs">
                      {JSON.stringify(
                        msg.result.object ?? msg.result.rows ?? {},
                        null,
                        2,
                      )}
                    </pre>
                  ) : (
                    <div className="text-sm">
                      {msg.result.summary || (msg.result.rows && msg.result.rows.length > 0 ? "Data available." : "No records found.")}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {msg.integrations.map((cta) => (
                    <Button
                      key={cta.id}
                      variant="secondary"
                      size="sm"
                      className="w-full border border-border bg-background hover:bg-accent"
                      onClick={() => handleActionClick(cta)}
                    >
                      {cta.label || `Connect ${cta.name || cta.id}`}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="bg-muted w-max rounded-lg px-3 py-2 text-sm text-muted-foreground">
              Thinking...
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4">
        {integrationMode === "manual" && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Using integrations:</span>
            {selectedIntegrationIds.map((id) => {
              const config = INTEGRATIONS_UI.find((i) => i.id === id);
              const status = integrationStatuses ? integrationStatuses[id] : undefined;

              let icon;
              let labelClass = "text-muted-foreground";
              let actionElement = null;

              if (status === "connected") {
                icon = <div className="h-2 w-2 rounded-full bg-green-500" />;
                labelClass = "text-foreground";
              } else if (status === "connecting") {
                icon = <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
                labelClass = "text-muted-foreground";
              } else if (status === "error") {
                icon = <div className="h-2 w-2 rounded-full bg-red-500" />;
                labelClass = "text-destructive";
                actionElement = (
                  <button
                    className="ml-1 text-xs underline hover:text-foreground"
                    onClick={() =>
                      handleActionClick({
                        id,
                        name: config?.name || id,
                        connected: false,
                        label: "Retry",
                        action: "connect",
                      })
                    }
                  >
                    Retry
                  </button>
                );
              } else if (status === "not_connected") {
                icon = <div className="h-2 w-2 rounded-full border border-muted-foreground" />;
                labelClass = "text-muted-foreground";
                actionElement = (
                  <button
                    className="ml-1 text-xs font-semibold text-primary hover:underline"
                    onClick={() =>
                      handleActionClick({
                        id,
                        name: config?.name || id,
                        connected: false,
                        label: "Connect",
                        action: "connect",
                      })
                    }
                  >
                    Connect
                  </button>
                );
              } else {
                icon = <div className="h-2 w-2 rounded-full border border-muted-foreground" />;
                labelClass = "text-muted-foreground";
                actionElement = null;
              }

              return (
                <div
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs"
                >
                  {icon}
                  <span className={cn("font-medium", labelClass)}>{config?.name || id}</span>
                  {actionElement}
                  <button
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleIntegration(id)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
            <div className="relative">
              <button
                className="flex items-center gap-1 rounded-full border border-dashed bg-transparent px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setIsSelectorOpen(!isSelectorOpen)}
              >
                <Plus className="h-3 w-3" /> Add Integration
              </button>
              {isSelectorOpen && (
                <div className="absolute bottom-full left-0 z-50 mb-1 w-48 rounded-md border bg-popover p-1 shadow-md">
                  {INTEGRATIONS_UI.map((integration) => {
                    const isSelected = selectedIntegrationIds.includes(integration.id);
                    return (
                      <button
                        key={integration.id}
                        className={cn(
                          "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground",
                          isSelected && "bg-accent/50"
                        )}
                        onClick={() => {
                          toggleIntegration(integration.id);
                          setIsSelectorOpen(false);
                        }}
                      >
                        {integration.name}
                        {isSelected && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your tool..."
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
