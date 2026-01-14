"use client";

import * as React from "react";
import { Share, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { PromptBar } from "@/components/dashboard/prompt-bar";
import { ZeroStateView } from "@/components/dashboard/zero-state";
import { ExecutionTimeline, type TimelineStep } from "@/components/dashboard/execution-timeline";
import type { ToolSpec } from "@/lib/spec/toolSpec";

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
  const [executionSteps, setExecutionSteps] = React.useState<TimelineStep[]>([]);
  const [isExecuting, setIsExecuting] = React.useState(false);

  // Derived state
  const isZeroState = messages.length === 0;

  // Dynamic Header Title
  const headerTitle = project?.spec?.title || "New Chat";

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    // Add user message
    const userMsg = { role: "user", content: inputValue };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsExecuting(true);

    // Simulate execution start (Mock for now to demonstrate UI transition)
    simulateExecution();
  };

  const simulateExecution = async () => {
    // Mock steps
    const step1: TimelineStep = {
      id: "1",
      label: "Processing Read Data",
      status: "running",
      narrative:
        "I'll help you create a chart to visualize the yearly sales data from your spreadsheet. Let me first read the data to understand its structure.",
    };
    setExecutionSteps([step1]);

    await new Promise((r) => setTimeout(r, 2000));

    setExecutionSteps((prev) =>
      prev.map((s) =>
        s.id === "1" ? { ...s, status: "success", resultAvailable: true } : s
      )
    );

    const step2: TimelineStep = {
      id: "2",
      label: "Processing Create Chart",
      status: "running",
      narrative:
        "Perfect! I can see the monthly sales data from January to December. Now I'll create a line chart to visualize the yearly sales progression using the Month and Total Sales columns.",
    };
    setExecutionSteps((prev) => [...prev, step2]);

    await new Promise((r) => setTimeout(r, 2500));

    setExecutionSteps((prev) =>
      prev.map((s) =>
        s.id === "2" ? { ...s, status: "success", resultAvailable: true } : s
      )
    );
    setIsExecuting(false);
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      {!isZeroState && (
        <header className="flex h-14 shrink-0 items-center justify-between px-6 border-b border-border/50 bg-background/50 backdrop-blur-sm z-10">
          <div className="flex-1" />
          <div className="font-semibold">{headerTitle}</div>
          <div className="flex-1 flex justify-end items-center gap-4">
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
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
          <div className="flex h-full flex-col">
            <ScrollArea className="flex-1">
              <div className="mx-auto max-w-3xl px-4 py-8">
                {/* Render User Prompt */}
                {messages
                  .filter((m) => m.role === "user")
                  .map((m, i) => (
                    <div
                      key={i}
                      className="mb-8 p-6 rounded-2xl bg-muted/30 border border-border/50 shadow-sm"
                    >
                      <div className="font-medium text-lg mb-2">{m.content}</div>
                      {/* Mock URL logic */}
                      {m.content.toLowerCase().includes("spreadsheet") && (
                         <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 p-2 rounded-md border border-border/50 w-fit max-w-full">
                            <span className="truncate">https://docs.google.com/spreadsheets/d/1nTs3t8W9SWO0dcGYKvw...</span>
                         </div>
                      )}
                    </div>
                  ))}

                {/* Execution Timeline */}
                <ExecutionTimeline steps={executionSteps} />

                {/* Final Output (Mock) */}
                {!isExecuting && executionSteps.length > 1 &&
                  executionSteps[1].status === "success" && (
                    <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                      <div className="mb-4 text-lg leading-relaxed">
                        Great! I&apos;ve successfully created a line chart to visualize
                        your yearly sales data. The chart shows:
                      </div>
                      <ul className="list-disc pl-5 space-y-2 mb-6 text-muted-foreground">
                        <li>
                          <strong className="text-foreground">Monthly progression</strong> from January
                          ($125,000) to December ($312,000)
                        </li>
                        <li>
                          <strong className="text-foreground">Clear upward trend</strong> demonstrating strong
                          sales growth throughout the year
                        </li>
                        <li>
                          <strong className="text-foreground">2.5x growth</strong> from the beginning to the
                          end of the year
                        </li>
                      </ul>
                      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
                        The chart is now embedded in your spreadsheet at: <br />
                        <span className="underline cursor-pointer hover:text-blue-300 transition-colors">
                          https://docs.google.com/spreadsheets/d/1nTs3...
                        </span>
                      </div>
                      
                      <div className="mt-6 text-muted-foreground leading-relaxed">
                        The visualization makes it easy to see your consistent month-over-month growth pattern, with total sales more than doubling from January to December. This is excellent performance data that clearly shows your business momentum throughout the year!
                      </div>
                    </div>
                  )}

                <div className="h-20" /> {/* Spacer */}
              </div>
            </ScrollArea>

            {/* Persistent Prompt Bar */}
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
      </div>
    </div>
  );
}
