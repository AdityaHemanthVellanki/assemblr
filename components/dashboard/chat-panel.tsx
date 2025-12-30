"use client";

import * as React from "react";
import { Send } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { DashboardSpec } from "@/lib/spec/dashboardSpec";

type Message = {
  role: "user" | "assistant";
  content: string;
  metadata?: {
    missing_integration_id?: string;
    action?: "connect_integration";
  };
};

interface ChatPanelProps {
  toolId: string;
  initialMessages?: Message[];
  onSpecUpdate: (spec: DashboardSpec) => void;
}

export function ChatPanel({ toolId, initialMessages = [], onSpecUpdate }: ChatPanelProps) {
  const [messages, setMessages] = React.useState<Message[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

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
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const res = await fetch(`/api/tools/${toolId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();
      
      setMessages((prev) => [
        ...prev,
        { 
          role: "assistant", 
          content: data.explanation,
          metadata: data.metadata ?? undefined,
        },
      ]);
      
      if (data.spec) {
        onSpecUpdate(data.spec);
      }
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
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
              <div>{msg.content}</div>
              
              {msg.metadata?.action === "connect_integration" && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 w-full border border-border bg-background hover:bg-accent"
                  asChild
                >
                  <Link href="/dashboard/integrations" target="_blank" rel="noopener noreferrer">
                    Connect Integration
                  </Link>
                </Button>
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
