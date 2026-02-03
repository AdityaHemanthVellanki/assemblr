"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Button } from "@/components/ui/button";

interface PromptBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading?: boolean;
  className?: string;
  variant?: "centered" | "bottom";
}

export function PromptBar({
  value,
  onChange,
  onSubmit,
  isLoading,
  className,
  variant = "bottom",
}: PromptBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className={cn(
        "relative w-full max-w-3xl mx-auto transition-all duration-300 ease-out",
        className,
      )}
    >
      <div className="relative flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/50 p-3 backdrop-blur-xl transition-all duration-200 focus-within:border-primary/40 focus-within:shadow-[0_8px_32px_rgba(8,10,25,0.2)]">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          className="min-h-[48px] w-full resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          rows={1}
          disabled={isLoading}
          style={{ height: "auto" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
          }}
        />

        <div className="flex items-center justify-end px-1">
          <Button
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full transition-all duration-200",
              value.trim()
                ? "bg-primary text-primary-foreground shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted",
            )}
            onClick={onSubmit}
            disabled={!value.trim() || isLoading}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {variant === "centered" && (
        <div className="absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 opacity-60 blur-xl" />
      )}
    </div>
  );
}
