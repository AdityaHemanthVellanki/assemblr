"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Search, Plus, Pencil, Trash2, Loader2, MoreHorizontal, Plug, Sparkles, PanelLeftClose, PanelLeftOpen, GitBranch, Settings } from "lucide-react";
import { motion } from "framer-motion";

import { cn } from "@/lib/ui/cn";
import { staggerContainer, staggerItem, fadeIn } from "@/lib/ui/motion";
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
  style,
  isCollapsed,
  onToggleCollapse,
}: {
  className?: string;
  role: OrgRole;
  style?: React.CSSProperties;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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

  const handleNewChat = React.useCallback(() => {
    router.push('/app/chat');
  }, [router]);

  const startRename = (project: { id: string; name: string }) => {
    setEditingId(project.id);
    setEditName(project.name);
  };

  const submitRename = async (id: string) => {
    if (!editName.trim() || editName.trim().length > 80) {
      setEditingId(null);
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
      console.error(err);
      void loadProjects();
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

      setProjects(prev => prev.filter(p => p.id !== deletingId));

      if (pathname?.includes(deletingId)) {
        router.push('/app/chat');
      }
    } catch (err) {
      console.error(err);
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

  // Navigation Items
  const integrationsHref = "/dashboard/integrations";
  const useCasesHref = "/use-cases";
  const skillGraphHref = "/app";
  const settingsHref = "/dashboard/settings";
  const integrationsActive = pathname?.startsWith(integrationsHref);
  const useCasesActive = pathname?.startsWith(useCasesHref);
  const skillGraphActive = pathname === "/app";
  const settingsActive = pathname?.startsWith(settingsHref);
  const canManage = canManageIntegrations(role);

  return (
    <aside
      style={style}
      className={cn(
        "flex h-full flex-col border-r border-white/10 bg-[#09090b]",
        className,
      )}
    >
      {/* Brand Header */}
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 px-4 cursor-pointer transition-opacity hover:opacity-80 border-b border-white/5",
          isCollapsed && "justify-center px-0"
        )}
        onClick={() => router.push('/app/chat')}
      >
        <div className="relative h-6 w-6 shrink-0 bg-primary/20 rounded-md flex items-center justify-center">
          {/* Using the image from before but maybe wrapped nicely or just the image */}
          <Image
            src="/images/logo-icon.png"
            alt={APP_NAME}
            fill
            className="object-contain p-0.5"
            priority
          />
        </div>
        {!isCollapsed && <span className="text-lg font-bold tracking-tight text-white">{APP_NAME}</span>}
      </div>

      <div className={cn("flex flex-col gap-2 px-3 py-2", isCollapsed && "px-2")}>

        {/* New Chat Button */}
        <button
          type="button"
          onClick={handleNewChat}
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
            pathname === '/app/chat'
              ? "bg-white/10 text-white shadow-none border border-white/5"
              : "text-muted-foreground hover:bg-white/5 hover:text-white",
            isCollapsed && "justify-center px-0 h-10 w-10 mx-auto"
          )}
          title="New Chat"
        >
          <Plus className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>New Chat</span>}
        </button>

        {/* Persistent Navigation */}
        <div className="flex flex-col gap-0.5 mt-2 pb-2">
          <motion.div variants={fadeIn} initial="hidden" animate="visible" custom={0.1} className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Platform</motion.div>
          <Link
            href={skillGraphHref}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isCollapsed ? "justify-center px-0 h-10 w-10 mx-auto" : "",
              skillGraphActive ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"
            )}
            title="Skill Graph"
          >
            <GitBranch className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Skill Graph</span>}
          </Link>

          <Link
            href={useCasesHref}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isCollapsed ? "justify-center px-0 h-10 w-10 mx-auto" : "",
              useCasesActive ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"
            )}
            title="Use Cases"
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Use Cases</span>}
          </Link>

          <Link
            href={integrationsHref}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isCollapsed ? "justify-center px-0 h-10 w-10 mx-auto" : "",
              integrationsActive ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"
            )}
            title="Integrations"
          >
            <Plug className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Integrations</span>}
          </Link>

          <Link
            href={settingsHref}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
              isCollapsed ? "justify-center px-0 h-10 w-10 mx-auto" : "",
              settingsActive ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"
            )}
            title="Settings"
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span>Settings</span>}
          </Link>
        </div>

      </div>

      {/* Chat History List */}
      <ScrollArea className="flex-1 w-full px-3">
        {!isCollapsed && (
          <div className="flex w-full flex-col gap-1 py-2">

            {/* Search - Only show if not collapsed */}
            <div className="relative mb-2 px-1">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search chats..."
                className="pl-8 h-8 text-xs bg-muted/30 border-border/40 focus:bg-muted/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <motion.div variants={fadeIn} initial="hidden" animate="visible" custom={0.15} className="px-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Recent Chats
            </motion.div>

            {projectsLoading && projects.length === 0 ? (
              <div className="space-y-2 px-1">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="shimmer h-8 rounded-lg" />
                ))}
              </div>
            ) : projectsError ? (
              <div className="px-3 py-2 text-xs text-red-600">{projectsError}</div>
            ) : visibleProjects.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No chats yet.</div>
            ) : (
              <motion.div variants={staggerContainer} initial="hidden" animate="visible">
              {visibleProjects.map((project) => {
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
                  <motion.div
                    key={project.id}
                    variants={staggerItem}
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "group relative rounded-lg transition-colors duration-200 w-full overflow-hidden mb-0.5",
                      active
                        ? "bg-white/10 text-white font-medium"
                        : "text-muted-foreground hover:bg-white/5 hover:text-white",
                      isInvalid ? "opacity-50" : ""
                    )}
                  >
                    <Link
                      href={`/dashboard/projects/${project.id}`}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm truncate pr-8",
                        isInvalid ? "pointer-events-none" : ""
                      )}
                      aria-disabled={isInvalid}
                    >
                      <span className="truncate">{project.name}</span>
                    </Link>

                    {/* Hover Actions */}
                    <div className={cn(
                      "absolute right-1 top-1/2 -translate-y-1/2 z-10 hidden items-center justify-end",
                      "group-hover:flex focus-within:flex",
                      active ? "flex" : ""
                    )}>
                      <div className={cn(
                        "flex items-center rounded-md bg-background/80 shadow-sm backdrop-blur-md p-0.5",
                        active ? "bg-accent" : ""
                      )}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            startRename(project);
                          }}
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-red-500"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            confirmDelete(project.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </motion.div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Collapse Toggle */}
      <div className={cn("p-4 border-t border-white/10", isCollapsed && "flex justify-center p-2")}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className={cn("text-muted-foreground hover:text-white hover:bg-white/5", isCollapsed ? "h-8 w-8 p-0" : "w-full justify-start gap-2")}
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!isCollapsed && <span>Collapse Sidebar</span>}
        </Button>
      </div>

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
    </aside >
  );
}
