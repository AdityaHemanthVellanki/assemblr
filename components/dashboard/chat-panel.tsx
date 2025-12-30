"use client";

import * as React from "react";
import { Send, ChevronDown, Plus, X, Check, Loader2, AlertCircle } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";

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
  | { role: "user" | "assistant"; type: "text"; content: string }
  | { role: "assistant"; type: "integration_action"; integrations: IntegrationCTA[] };

interface ChatPanelProps {
  toolId: string;
  initialMessages?: RawMessage[];
  onSpecUpdate: (spec: DashboardSpec) => void;
}

export function ChatPanel({ toolId, initialMessages = [], onSpecUpdate }: ChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>(() => {
    return initialMessages.map((m) => {
      const meta = m.metadata ?? undefined;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const rec = meta as Record<string, unknown>;
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
      return { role: m.role, type: "text", content: m.content };
    });
  });
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Integration Mode State
  const [integrationMode, setIntegrationMode] = React.useState<"auto" | "manual">("auto");
  const [selectedIntegrationIds, setSelectedIntegrationIds] = React.useState<string[]>([]);
  const [integrationStatuses, setIntegrationStatuses] = React.useState<Record<string, IntegrationConnectionStatus>>({});
  const [isModeOpen, setIsModeOpen] = React.useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    async function fetchStatuses() {
      try {
        const res = await fetch("/api/integrations");
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.integrations && Array.isArray(data.integrations)) {
          const map: Record<string, IntegrationConnectionStatus> = {};
          data.integrations.forEach((i: any) => {
            // Respect existing "connecting" or "error" if we have logic for it?
            // For now, map backend status.
            // If backend says connected, it's connected.
            // If not connected, it's not_connected.
            // We'll handle "connecting" via local override during action.
            map[i.id] = i.connected ? "connected" : "not_connected";
          });
          setIntegrationStatuses((prev) => {
             // If we have a local "connecting" state, and backend says "connected", we update.
             // If backend says "not_connected", and we are "connecting", we might keep it if it's recent?
             // But since we do full page reload for OAuth, the "connecting" state is lost on reload anyway.
             // So we just use the backend state.
             // UNLESS we are handling the return from OAuth with an error param.
             return map;
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    fetchStatuses();
    const interval = setInterval(fetchStatuses, 5000); // Poll every 5s
    return () => {
      mounted = false;
      clearInterval(interval);
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
        ...prev,
        [provider]: "error",
      }));
    }
  }, []);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  React.useEffect(() => {
    const storedMode = sessionStorage.getItem("integrationMode");
    if (storedMode === "manual") setIntegrationMode("manual");

    const storedIds = sessionStorage.getItem("selectedIntegrationIds");
    if (storedIds) {
      try {
        const parsed = JSON.parse(storedIds);
        if (Array.isArray(parsed)) {
          setSelectedIntegrationIds(parsed);
        }
      } catch (e) {
        // Ignore parse error
      }
    }
  }, []);

  React.useEffect(() => {
    sessionStorage.setItem("integrationMode", integrationMode);
  }, [integrationMode]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", type: "text", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/tools/${toolId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          integrationMode,
          selectedIntegrations:
            integrationMode === "manual"
              ? selectedIntegrationIds.map((id) => ({
                  id,
                  status: integrationStatuses[id] || "not_connected",
                }))
              : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();

      if (data?.message?.type === "integration_action" && Array.isArray(data.message.integrations)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", type: "integration_action", integrations: data.message.integrations },
        ]);
      } else {
        const content = typeof data.explanation === "string" ? data.explanation : "";
        setMessages((prev) => [...prev, { role: "assistant", type: "text", content }]);
      }
      
      if (data.spec) {
        onSpecUpdate(data.spec);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", type: "text", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function getConnectUrl(integrationId: string) {
    const params = new URLSearchParams();
    params.set("provider", integrationId);
    params.set("source", "chat");
    if (pathname) {
      params.set("redirectPath", pathname);
    }
    return `/api/oauth/start?${params.toString()}`;
  }

  function handleActionClick(cta: IntegrationCTA) {
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
      // Phase 1: Always Hosted OAuth -> Immediate Redirect
      window.location.href = getConnectUrl(cta.id);
    }
  }

  function toggleIntegration(id: string) {
    setSelectedIntegrationIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  return (
    <div className="flex h-full flex-col border-r bg-muted/10">
      <div className="flex items-center justify-between border-b p-4">
        <div>
          <h2 className="font-semibold">Assemblr AI</h2>
          <p className="text-xs text-muted-foreground">Build your tool with chat</p>
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
                <div>{msg.content}</div>
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
              const status = integrationStatuses[id] || "not_connected";

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
              } else {
                // not_connected
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
