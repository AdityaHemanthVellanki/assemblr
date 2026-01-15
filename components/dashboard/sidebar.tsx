"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  Search, 
  Plus, 
  Zap, 
  Mail, 
  Calendar, 
  FileText, 
  Github, 
  Slack,
  Settings
} from "lucide-react";

import { cn } from "@/lib/ui/cn";
import { APP_NAME } from "@/lib/branding";
import { roleLabel, type OrgRole } from "@/lib/auth/permissions.client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

const TOOLS = [
  { name: "Gmail", icon: Mail, id: "gmail" },
  { name: "Google Sheets", icon: FileText, id: "sheets" },
  { name: "Calendar", icon: Calendar, id: "calendar" },
  { name: "Notion", icon: FileText, id: "notion" },
  { name: "Slack", icon: Slack, id: "slack" },
  { name: "GitHub", icon: Github, id: "github" },
];

const HISTORY = [
  { label: "Sales Data Visualization", active: true },
  { label: "Data Visualization Setup" },
  { label: `${APP_NAME} Chart Demos` },
  { label: "Stock Price Analysis" },
  { label: "Revolutionizing Digital Experie..." },
  { label: "Slack Capybara Prank" },
];

const PREVIOUS_HISTORY = [
  { label: "Competitor Analysis" },
  { label: "Q3 Roadmap Draft" },
];

export function Sidebar({
  className,
  role,
}: {
  className?: string;
  role: OrgRole;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeToolId = searchParams?.get("tool_context");
   const [searchQuery, setSearchQuery] = React.useState("");

  const handleToolClick = (toolId: string) => {
    // In a real app, this might use a Global Context or URL state
    // For now, we use URL params to demonstrate "Injecting Context" to the page
    const params = new URLSearchParams(searchParams?.toString() || "");
    if (activeToolId === toolId) {
        params.delete("tool_context");
    } else {
        params.set("tool_context", toolId);
    }
    // Push new params (shallow routing if supported, or just nav)
    router.push(`?${params.toString()}`);
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleToday = normalizedQuery
    ? HISTORY.filter((item) =>
        item.label.toLowerCase().includes(normalizedQuery),
      )
    : HISTORY;
  const visiblePrevious = normalizedQuery
    ? PREVIOUS_HISTORY.filter((item) =>
        item.label.toLowerCase().includes(normalizedQuery),
      )
    : PREVIOUS_HISTORY;

  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-border bg-background",
        className,
      )}
    >
      <div className="flex h-14 items-center gap-2 px-4 font-bold text-lg text-primary cursor-pointer" onClick={() => router.push('/app/chat')}>
        <div className="h-6 w-6 rounded bg-primary/20 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-primary" />
        </div>
        {APP_NAME}
      </div>

      <div className="flex flex-col gap-6 px-3 py-2">
        {/* B. Global Search Input */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search threads..." 
            className="pl-8 h-9 bg-muted/50 border-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* C. Primary Actions */}
        <div className="flex flex-col gap-1">
            <Link
                href="/app/chat"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
                <Plus className="h-4 w-4" />
                New Chat
            </Link>
            <Link
                href="/dashboard/workflows"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
                <Zap className="h-4 w-4" />
                Workflows
            </Link>
        </div>

      </div>

      {/* E. Conversation History */}
      <ScrollArea className="flex-1 px-3">
         <div className="flex flex-col gap-2 py-2">
            <div className="px-3 text-xs font-semibold text-muted-foreground">TODAY</div>
            <div className="flex flex-col gap-1">
                {visibleToday.map((item) => (
                  <div
                    key={item.label}
                    className={cn(
                      "truncate rounded-md px-3 py-2 text-sm",
                      item.active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </div>
                ))}
            </div>
            
            <div className="mt-4 px-3 text-xs font-semibold text-muted-foreground">PREVIOUS 7 DAYS</div>
            <div className="flex flex-col gap-1">
                 {visiblePrevious.map((item) => (
                   <div
                     key={item.label}
                     className="truncate rounded-md px-3 py-2 text-sm text-muted-foreground"
                   >
                     {item.label}
                   </div>
                 ))}
            </div>
         </div>

        {/* D. Tool Access (Moved below history) */}
        <div className="flex flex-col gap-2 mt-6 mb-4">
            <div className="px-3 text-xs font-semibold text-muted-foreground">TOOLS</div>
            <div className="flex flex-col gap-1">
                {TOOLS.map((tool) => {
                    const isActive = activeToolId === tool.id;
                    return (
                        <button
                            key={tool.id}
                            onClick={() => handleToolClick(tool.id)}
                            className={cn(
                                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-left transition-colors",
                                isActive 
                                    ? "bg-primary/10 text-primary" 
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <tool.icon className="h-4 w-4" />
                            {tool.name}
                        </button>
                    );
                })}
            </div>
        </div>
      </ScrollArea>

      <div className="mt-auto border-t border-border p-4">
        <div className="flex items-center justify-between">
            <div className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
            {roleLabel(role)}
            </div>
            <Link href="/dashboard/settings">
                <Settings className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Link>
        </div>
      </div>
    </aside>
  );
}
