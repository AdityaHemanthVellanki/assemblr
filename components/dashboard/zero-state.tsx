"use client";

import { PromptBar } from "@/components/dashboard/prompt-bar";
import { Zap, Calendar, Mail } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const SUGGESTIONS = [
  {
    title: "Sprint Planning",
    description: "Look at Linear and create a sprint plan for the next 2 weeks",
    icon: Zap,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    title: "Summarize Meetings",
    description: "Summarize my key meetings this week from Google Calendar",
    icon: Calendar,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    title: "Scan Emails",
    description: "Check my emails and send out meetings to anyone needed",
    icon: Mail,
    color: "text-red-500",
    bg: "bg-red-500/10",
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
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="flex w-full max-w-3xl flex-col items-center gap-8">
        
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Words to actions in{" "}
            <span className="bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
              seconds
            </span>
          </h1>
          <p className="text-lg text-muted-foreground">
            Assemblr is your AI agent for Gmail, Calendar, Notion, and more.
          </p>
        </div>

        {/* Prompt Bar */}
        <div className="w-full py-8">
          <PromptBar
            value={inputValue}
            onChange={onInputChange}
            onSubmit={onSubmit}
            variant="centered"
            className="shadow-2xl"
          />
        </div>

        {/* Suggestion Cards */}
        <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {SUGGESTIONS.map((card) => (
            <button
              key={card.title}
              onClick={() => onSuggestionClick(card.description)}
              className="group relative flex flex-col gap-3 rounded-xl border bg-card/50 p-4 text-left transition-all hover:bg-card hover:shadow-md hover:border-primary/20"
            >
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center transition-colors", card.bg, card.color)}>
                <card.icon className="h-4 w-4" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold">{card.title}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">
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
