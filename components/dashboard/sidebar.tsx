"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Search, Plus, Pencil, Trash2, Loader2, MoreHorizontal, Plug, Sparkles } from "lucide-react";

import { cn } from "@/lib/ui/cn";
import { APP_NAME } from "@/lib/branding";
import { type OrgRole, canManageIntegrations } from "@/lib/permissions-shared";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function Sidebar({
  className,
  role,
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

  // Rename & Delete state
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const loadProjects = React.useCallback(async () => {
    // Only show loading on initial load or empty state, not during background refreshes
    if (projects.length === 0) setProjectsLoading(true);
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
    const handleRefresh = () => {
      void loadProjects();
    };
    window.addEventListener("projects:refresh", handleRefresh);
    return () => window.removeEventListener("projects:refresh", handleRefresh);
  }, [loadProjects]);

  // Reload when path changes (e.g. new chat created elsewhere)
  React.useEffect(() => {
    if (pathname === '/app/chat' || pathname?.startsWith('/dashboard/projects/')) {
        void loadProjects();
    }
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
        // We push the new project to state immediately to avoid lag
        setProjects(prev => [{
            id: json.id,
            name: "New chat",
            updatedAt: new Date().toISOString(),
            isValidSpec: true,
            specError: null
        }, ...prev]);
      }
    } catch {
      setProjectsError("Failed to create chat");
    }
  }, [router]);

  const startRename = (project: { id: string; name: string }) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const submitRename = async (id: string) => {
    if (!editName.trim() || editName.trim().length > 80) {
      setEditingId(null); // Cancel if invalid
      return;
    }

    const newName = editName.trim();
    
    // Optimistic update
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
    setEditingId(null);

    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error("Failed to rename");
    } catch (err) {
      // Rollback
      console.error(err);
      void loadProjects(); // Reload to get correct state
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
  };

  const submitDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${deletingId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");

      // Remove from state
      setProjects(prev => prev.filter(p => p.id !== deletingId));

      // Redirect if we were on that page
      if (pathname?.includes(deletingId)) {
         router.push('/app/chat');
      }
    } catch (err) {
      console.error(err);
      // Rollback state on failure
      void loadProjects();
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleProjects = normalizedQuery
    ? projects.filter((project) => project.name.toLowerCase().includes(normalizedQuery))
    : projects;
  const integrationsHref = "/dashboard/integrations";
  const useCasesHref = "/use-cases";
  const integrationsActive = pathname?.startsWith(integrationsHref);
  const useCasesActive = pathname?.startsWith(useCasesHref);
  const canManage = canManageIntegrations(role);
  const navItems = [
    {
      id: "use-cases",
      label: "Use Cases",
      href: useCasesHref,
      icon: Sparkles,
      disabled: false,
    },
    {
      id: "integrations",
      label: "Integrations",
      href: integrationsHref,
      icon: Plug,
      disabled: !canManage,
      tooltip: "You don’t have permission to manage integrations.",
    },
  ];

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
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.href === useCasesHref ? useCasesActive : integrationsActive;
              if (item.disabled) {
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm flex items-center gap-2 text-muted-foreground opacity-60 cursor-not-allowed",
                      active ? "bg-accent/50" : "",
                    )}
                    role="link"
                    aria-disabled="true"
                    title={item.tooltip}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm transition flex items-center gap-2",
                    active
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/40",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
        </div>

      </div>

      <ScrollArea className="flex-1 px-3">
         <div className="flex flex-col gap-2 py-2">
          {projectsLoading && projects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">Loading chats…</div>
          ) : projectsError ? (
            <div className="px-3 py-2 text-xs text-red-600">{projectsError}</div>
          ) : visibleProjects.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet.</div>
          ) : (
            visibleProjects.map((project) => {
              const active = pathname?.includes(`/dashboard/projects/${project.id}`);
              const isInvalid = !project.isValidSpec;
              const isEditing = editingId === project.id;

              if (isEditing) {
                return (
                  <div key={project.id} className="px-1 py-1">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => submitRename(project.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(project.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-8 text-sm"
                    />
                  </div>
                );
              }

              return (
                <div key={project.id} className="group relative">
                  <Link
                    href={`/dashboard/projects/${project.id}`}
                    className={cn(
                      "truncate rounded-md px-3 py-2 text-sm transition flex items-center gap-2 block pr-14",
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
                  {/* Hover Actions */}
                  <div className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 hidden items-center gap-0.5 bg-transparent",
                    "group-hover:flex",
                    active ? "flex" : "" // Show on active item too for better UX
                  )}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        startRename(project);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        confirmDelete(project.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
         </div>
      </ScrollArea>

      <Dialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete chat?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the chat and all associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={submitDelete} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
