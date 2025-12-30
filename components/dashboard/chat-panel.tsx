"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";

type IntegrationCTA = {
  id: string;
  name?: string;
  logoUrl?: string;
  connected?: boolean;
  label?: string;
  action?: string;
};

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

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
        body: JSON.stringify({ message: userMessage }),
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

  function handleConnectClick(integrationId: string) {
    // Phase 1: Always Hosted OAuth -> Immediate Redirect
    window.location.href = getConnectUrl(integrationId);
  }

  return (
    <div className="flex h-full flex-col border-r bg-muted/10">
      <div className="border-b p-4">
        <h2 className="font-semibold">Assemblr AI</h2>
        <p className="text-xs text-muted-foreground">Build your tool with chat</p>
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
                      onClick={() => handleConnectClick(cta.id)}
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
