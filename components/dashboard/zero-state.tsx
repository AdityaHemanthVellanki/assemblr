"use client";

import { PromptBar } from "@/components/dashboard/prompt-bar";
import { Zap, Calendar, Mail } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { CHAT_HERO_SUBTITLE, CHAT_HERO_TITLE } from "@/lib/branding";

const SUGGESTIONS = [
  {
    title: "Sprint Planning",
    description: "Look at Linear and create a sprint plan for the next 2 weeks",
    icon: Zap,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    title: "Summarize Meetings",
    description: "Summarize my key meetings this week from Google Calendar",
    icon: Calendar,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
  },
  {
    title: "Scan Emails",
    description: "Check my emails and send out meetings to anyone needed",
    icon: Mail,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
  },
];

interface ZeroStateViewProps {
  inputValue: string;
  onInputChange: (val: string) => void;
  onSubmit: () => void;
  onSuggestionClick: (val: string) => void;
}

export function ZeroStateView({
  inputValue,
  onInputChange,
  onSubmit,
  onSuggestionClick,
}: ZeroStateViewProps) {
  const highlightWord = "seconds";
  const [titlePrefix] = CHAT_HERO_TITLE.split(` ${highlightWord}`);

  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      {/* Radial gradient background */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.4),_transparent_70%)]" />

      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        {/* Hero text */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {titlePrefix}{" "}
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
              {highlightWord}
            </span>
          </h1>
          <p className="text-base text-muted-foreground sm:text-lg">
            {CHAT_HERO_SUBTITLE}
          </p>
        </div>

        {/* Prompt Bar */}
        <div className="w-full py-6">
          <PromptBar
            value={inputValue}
            onChange={onInputChange}
            onSubmit={onSubmit}
            variant="centered"
            className="shadow-[0_16px_40px_rgba(8,10,25,0.35)]"
          />
        </div>

        {/* Suggestion Cards */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {SUGGESTIONS.map((card) => (
            <button
              key={card.title}
              onClick={() => onSuggestionClick(card.description)}
              className={cn(
                "group relative flex flex-col gap-3 rounded-2xl border bg-background/40 p-5 text-left backdrop-blur-sm transition-all duration-200",
                "hover:border-primary/40 hover:shadow-[0_16px_40px_rgba(8,10,25,0.25)]",
                card.border
              )}
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center transition-colors",
                  card.bg,
                  card.color
                )}
              >
                <card.icon className="h-4 w-4" />
              </div>
              <div className="space-y-1.5">
                <div className="font-semibold text-foreground/90">{card.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {card.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
