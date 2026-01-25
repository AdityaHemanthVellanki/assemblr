"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Search, Plus } from "lucide-react";

import { cn } from "@/lib/ui/cn";
import { APP_NAME } from "@/lib/branding";
import { type OrgRole } from "@/lib/permissions-shared";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

export function Sidebar({
  className,
  role: _role,
}: {
  className?: string;
  role: OrgRole;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string; updatedAt: string; isValidSpec: boolean; specError?: string | null }>>([]);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [projectsError, setProjectsError] = React.useState<string | null>(null);

  const loadProjects = React.useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error("Failed to load chats");
      }
      const json = await res.json();
      setProjects(
        (json.projects ?? []).map((project: { id: string; name: string; updatedAt: string; isValidSpec?: boolean; specError?: string | null }) => ({
          id: project.id,
          name: project.name,
          updatedAt: project.updatedAt,
          isValidSpec: project.isValidSpec !== false,
          specError: project.specError ?? null,
        })),
      );
    } catch (err) {
      setProjectsError(err instanceof Error ? err.message : "Failed to load chats");
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  React.useEffect(() => {
    void loadProjects();
  }, [pathname, loadProjects]);

  const handleNewChat = React.useCallback(async () => {
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New chat" }),
      });
      if (!res.ok) {
        throw new Error("Failed to create chat");
      }
      const json = await res.json();
      if (json.id) {
        router.push(`/dashboard/projects/${json.id}`);
        void loadProjects();
      }
    } catch {
      setProjectsError("Failed to create chat");
    }
  }, [router, loadProjects]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleProjects = normalizedQuery
    ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery))
    : projects;

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
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search chats..." 
            className="pl-8 h-9 bg-muted/50 border-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </button>
        </div>

      </div>

      <ScrollArea className="flex-1 px-3">
         <div className="flex flex-col gap-2 py-2">
          {projectsLoading ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading chats…</div>
          ) : projectsError ? (
            <div className="px-3 py-2 text-xs text-red-600">{projectsError}</div>
          ) : visibleProjects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet.</div>
          ) : (
            visibleProjects.map((project) => {
              const active = pathname?.includes(`/dashboard/projects/${project.id}`);
              const isInvalid = !project.isValidSpec;
              return (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className={cn(
                    "truncate rounded-md px-3 py-2 text-sm transition flex items-center gap-2",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/40",
                    isInvalid ? "opacity-50 pointer-events-none" : "",
                  )}
                  aria-disabled={isInvalid}
                >
                  <span className="truncate">{project.name}</span>
                  {isInvalid ? (
                    <span className="ml-auto inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-red-500">
                      <AlertTriangle className="h-3 w-3" />
                      Failed
                    </span>
                  ) : null}
                </Link>
              );
            })
          )}
         </div>
      </ScrollArea>
    </aside>
  );
}
