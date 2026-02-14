"use client";

import * as React from "react";
import { Send, Sparkles, Paperclip, ArrowUp, Zap, Table, FileJson, List, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/ui/cn";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { safeFetch, ApiError } from "@/lib/api/client";
import { startOAuthFlow } from "@/app/actions/oauth";

// Types
type Role = "user" | "assistant";

interface IntegrationCTA {
  id: string;
  name?: string;
  label?: string;
  action?: string;
  connected?: boolean;
}

interface Message {
  id: string;
  role: Role;
  content: string;
  type?: "text" | "error" | "info" | "integration_action" | "data";
  metadata?: Record<string, any>;
  integrations?: IntegrationCTA[];
  result?: {
    result_type: "list" | "table" | "json" | "text";
    rows?: any[];
    object?: Record<string, any>;
    summary?: string;
  };
  timestamp?: number;
}

interface ChatPanelProps {
  toolId?: string;
  initialMessages?: any[];
  initialPrompt?: string | null;
  initialRequiredIntegrations?: string[] | null;
  onSpecUpdate: (spec: ToolSpec) => void;
  onStatusUpdate?: (status: string) => void;
  onToolIdChange: (id: string) => void;
  readOnly?: boolean;
}

export function ChatPanel({
  toolId,
  initialMessages = [],
  initialPrompt,
  initialRequiredIntegrations,
  onSpecUpdate,
  onStatusUpdate,
  onToolIdChange,
  readOnly
}: ChatPanelProps) {
  const router = useRouter();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>(() =>
    normalizeMessages(initialMessages)
  );
  const [isExecuting, setIsExecuting] = React.useState(false);

  // Auto-scroll
  React.useEffect(() => {
    if (scrollRef.current) {
      const scrollArea = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [messages]);

  // Initial Prompt Execution
  const ranInitial = React.useRef(false);
  React.useEffect(() => {
    if (ranInitial.current) return;
    if (initialPrompt && !toolId) {
      submitMessage(initialPrompt);
      ranInitial.current = true;
    }
  }, [initialPrompt, toolId]);

  // Resume Logic
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeId = params.get("resumeId");
    if (resumeId && toolId) {
      // Clear URL
      window.history.replaceState({}, "", window.location.pathname);

      setIsExecuting(true);
      safeFetch<{
        message: any;
        spec?: ToolSpec;
        metadata?: any;
      }>(`/api/tools/${toolId}/chat`, {
        method: "POST",
        body: JSON.stringify({ resumeId }),
      })
        .then(data => {
          const msgData = data.message || {};
          const assistantMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: msgData.content || (msgData.type === "integration_action" ? "Action required:" : (msgData.type === "data" ? "Result:" : "Action completed.")),
            type: msgData.type || "text",
            integrations: parseIntegrations(msgData.integrations),
            result: msgData.result,
            metadata: data.metadata,
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, assistantMsg]);
          if (data.spec) onSpecUpdate(data.spec);
        })
        .catch(err => {
          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Failed to resume execution.",
            type: "error"
          }]);
        })
        .finally(() => setIsExecuting(false));
    }
  }, [toolId, onSpecUpdate]);

  const submitMessage = async (content: string) => {
    if (!content.trim() || isExecuting) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: content,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsExecuting(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      let currentToolId = toolId;
      let url = currentToolId
        ? `/api/tools/${currentToolId}/chat`
        : `/api/tools/new`;

      if (!currentToolId) {
        const res = await safeFetch<any>("/api/projects", {
          method: "POST",
          body: JSON.stringify({ prompt: content })
        });
        currentToolId = res.id;
        if (currentToolId) {
          onToolIdChange(currentToolId);
          window.history.replaceState({}, "", `/dashboard/projects/${currentToolId}`);
          url = `/api/tools/${currentToolId}/chat`;
        }
      }

      // Use "create" mode when this is the first message (tool was just created),
      // so the compiler pipeline generates the spec and executes actions.
      // Use "chat" mode for subsequent messages on an existing tool.
      const chatMode = !toolId ? "create" : "chat";
      const data = await safeFetch<any>(url, {
        method: "POST",
        body: JSON.stringify({ message: content, mode: chatMode })
      });

      if (data.spec) {
        onSpecUpdate(data.spec);
        // Signal that tool is now materialized — this unblocks ToolRenderer
        console.log("[ChatPanel] Spec received, setting status to MATERIALIZED");
        onStatusUpdate?.("MATERIALIZED");
      }

      const msgData = data.message || {};
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: msgData.content || (msgData.type === "integration_action" ? "This action requires an integration:" : (msgData.type === "data" ? "Data retrieved:" : "Done.")),
        type: msgData.type || "text",
        integrations: parseIntegrations(msgData.integrations),
        result: msgData.result,
        metadata: data.metadata,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMsg]);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: err instanceof Error ? err.message : "Something went wrong.",
        type: "error"
      }]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleActionClick = async (cta: any) => {
    try {
      const oauthUrl = await startOAuthFlow({
        providerId: cta.id,
        chatId: toolId,
        toolId: toolId,
        currentPath: window.location.href,
        prompt: "Connect integration",
        integrationMode: "auto",
        blockedIntegration: cta.id
      });
      router.push(oauthUrl);
    } catch (err) {
      console.error("Failed to start OAuth", err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitMessage(input);
    }
  };

  return (
    <div className="flex bg-[#09090b] flex-col h-full overflow-hidden relative group">
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="flex flex-col gap-6 py-6 pb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm text-center px-8">
              <Sparkles className="w-8 h-8 mb-3 opacity-20" />
              <p>Describe the tool you want to build.<br />Assemblr will inspect schemas and write code for you.</p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} onAction={handleActionClick} />
          ))}
          {isExecuting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse px-2">
              <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce delay-150" />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 bg-[#09090b] border-t border-white/10 z-10">
        <div className="relative rounded-2xl border border-white/10 bg-[#18181b] focus-within:border-white/20 transition-all shadow-xl">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={readOnly ? "Read only mode" : "Clean data, add a chart..."}
            className="min-h-[48px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50 text-white"
            disabled={readOnly || isExecuting}
            rows={1}
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-white rounded-lg">
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
            <Button
              size="icon"
              className={cn("h-8 w-8 rounded-lg transition-all", input.trim() ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground hover:bg-white/10")}
              onClick={() => submitMessage(input)}
              disabled={!input.trim() || isExecuting || readOnly}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground/30 text-center mt-3">
          Assemblr generates real infrastructure. Verify critical actions.
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message, onAction }: { message: Message, onAction: (cta: any) => void }) {
  const isUser = message.role === "user";
  const isError = message.type === "error";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div className={cn(
        "px-5 py-3 max-w-[85%] text-sm rounded-2xl leading-relaxed whitespace-pre-wrap",
        isUser
          ? "bg-white/10 text-white"
          : isError ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-transparent text-neutral-200 border border-white/10"
      )}>
        {isError && <AlertCircle className="w-4 h-4 inline mr-2 text-red-500 mb-0.5" />}
        {message.content}

        {/* Integration Actions */}
        {message.type === "integration_action" && message.integrations && (
          <div className="mt-3 flex flex-col gap-2">
            {message.integrations.map((cta: any) => (
              <Button
                key={cta.id}
                variant="outline"
                size="sm"
                className="w-full justify-start bg-white/5 hover:bg-white/10 text-xs border-white/10 text-neutral-300 hover:text-white"
                onClick={() => onAction(cta)}
              >
                <Zap className="w-3 h-3 mr-2 text-amber-500" />
                {cta.label || `Connect ${cta.name || cta.id}`}
              </Button>
            ))}
          </div>
        )}

        {/* Data Snapshot */}
        {message.type === "data" && message.result && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs overflow-hidden">
            <div className="flex items-center gap-2 mb-2 text-neutral-400 font-medium">
              {message.result.result_type === "table" ? <Table className="w-3 h-3" /> : <List className="w-3 h-3" />}
              {message.result.summary || "Data Result"}
            </div>
            {Array.isArray(message.result.rows) && (
              <div className="max-h-40 overflow-auto text-neutral-400 scrollbar-thin scrollbar-thumb-white/10">
                <ul className="list-disc pl-4 space-y-1">
                  {message.result.rows.slice(0, 5).map((row, i) => (
                    <li key={i} className="truncate">
                      {typeof row === 'object' ? Object.values(row).join(", ") : String(row)}
                    </li>
                  ))}
                  {message.result.rows.length > 5 && (
                    <li className="list-none opacity-60 italic">... {message.result.rows.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Metadata Footer */}
      {!isUser && !isError && (
        <div className="flex items-center gap-2 px-1">
          {message.metadata?.executionId && (
            <div className="text-[10px] text-muted-foreground flex items-center gap-1 opacity-70">
              Built in {(message.metadata.durationMs / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function normalizeMessages(msgs: any[]): Message[] {
  return msgs.map(m => {
    let integrations: IntegrationCTA[] | undefined;
    // Basic normalization attempting to extract integration data if present in metadata
    // Real parsing logic should match what's in submitMessage
    return {
      id: crypto.randomUUID(),
      role: m.role,
      content: m.content || "",
      type: m.type || "text",
      metadata: m.metadata,
      integrations: m.integrations || undefined
    };
  });
}

function parseIntegrations(raw: any): IntegrationCTA[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.map(r => ({
    id: r.id,
    name: r.name,
    label: r.label,
    action: r.action,
    connected: r.connected
  }));
}
