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
        "relative w-full max-w-3xl mx-auto transition-all duration-500 ease-in-out",
        className,
      )}
    >
      <div className="relative flex flex-col gap-2 rounded-2xl border bg-background/50 p-2 shadow-sm backdrop-blur-xl ring-1 ring-white/10 focus-within:ring-primary/50 transition-shadow">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything..."
          className="min-h-[44px] w-full resize-none bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          rows={1}
          disabled={isLoading}
          style={{ height: "auto" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = `${target.scrollHeight}px`;
          }}
        />

        <div className="flex items-center justify-end px-2 pb-1">
          <Button
            size="icon"
            className={cn(
              "h-8 w-8 rounded-full transition-all duration-200",
              value.trim()
                ? "bg-primary text-primary-foreground"
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
        <div className="absolute -inset-0.5 -z-10 rounded-2xl bg-gradient-to-r from-primary/20 via-purple-500/20 to-blue-500/20 opacity-50 blur-xl" />
      )}
    </div>
  );
}
