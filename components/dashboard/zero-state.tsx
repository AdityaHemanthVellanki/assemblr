"use client";

import * as React from "react";
import { Sparkles, ArrowRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ZeroStateViewProps {
  onPromptSubmit: (prompt: string) => void;
}

const SAMPLE_PROMPTS = [
  "Build a CRM for tracking sales leads",
  "Create a dashboard for GitHub issues",
  "Make an internal tool to manage inventory",
  "Design a customer support ticket system"
];

export function ZeroStateView({ onPromptSubmit }: ZeroStateViewProps) {
  const [input, setInput] = React.useState("");

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) {
      onPromptSubmit(input);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-8 animate-in fade-in zoom-in duration-500 py-12">
      <div className="relative">
        <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-primary/20 via-purple-500/20 to-blue-500/20 blur-xl opacity-50" />
        <div className="relative bg-background rounded-full p-4 shadow-sm border border-border/50">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">What do you want to build?</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Describe your tool in plain English. Assemblr will inspect schemas, generate code, and handle deployment.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg relative group">
        <div className="relative rounded-xl border border-border bg-background shadow-sm focus-within:ring-2 focus-within:ring-primary/20 transition-all overflow-hidden z-10">
          <Textarea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            placeholder="e.g. Create a tool to manage..."
            className="min-h-[60px] w-full resize-none border-0 bg-transparent px-4 py-3 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/50 bg-muted/5"
            onKeyDown={handleKeyDown}
          />
          <div className="flex justify-end px-2 py-2 bg-muted/20 border-t border-border/40">
            <Button size="sm" type="submit" disabled={!input.trim()}>
              Start Building <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
        {SAMPLE_PROMPTS.map((prompt, i) => (
          <button
            key={i}
            onClick={() => onPromptSubmit(prompt)}
            className="flex items-center gap-2 p-3 text-xs text-left text-muted-foreground bg-muted/30 hover:bg-muted/60 hover:text-foreground rounded-lg border border-transparent hover:border-border/60 transition-all group"
          >
            <Lightbulb className="w-3 h-3 opacity-50 group-hover:text-amber-500 transition-colors" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
