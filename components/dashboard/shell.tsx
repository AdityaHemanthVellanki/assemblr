"use client";

import * as React from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import type { OrgRole } from "@/lib/permissions-shared";

export function DashboardShell({
  children,
  role,
}: {
  children: React.ReactNode;
  role: OrgRole;
}) {
  const [sidebarWidth, setSidebarWidth] = React.useState(256);
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isResizing, setIsResizing] = React.useState(false);
  const [isClient, setIsClient] = React.useState(false);

  // Load state from local storage on mount
  React.useEffect(() => {
    setIsClient(true);
    const savedWidth = localStorage.getItem("assemblr-sidebar-width");
    const savedCollapsed = localStorage.getItem("assemblr-sidebar-collapsed");

    if (savedWidth) {
      setSidebarWidth(parseInt(savedWidth, 10));
    }
    if (savedCollapsed === "true") {
      setIsCollapsed(true);
    }
  }, []);

  // Save state to local storage when changed
  React.useEffect(() => {
    if (isClient) {
      localStorage.setItem("assemblr-sidebar-width", sidebarWidth.toString());
      localStorage.setItem("assemblr-sidebar-collapsed", isCollapsed.toString());
    }
  }, [sidebarWidth, isCollapsed, isClient]);

  const toggleCollapsed = React.useCallback(() => {
    setIsCollapsed((prev) => !prev);
  }, []);

  const startResizing = React.useCallback(() => {
    if (isCollapsed) return; // Cannot resize when collapsed
    setIsResizing(true);
  }, [isCollapsed]);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = React.useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = mouseMoveEvent.clientX;
        const MIN_WIDTH = 240;
        const MAX_WIDTH = 480;

        if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  React.useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <Sidebar
        role={role}
        style={{ width: isCollapsed ? 64 : sidebarWidth }}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapsed}
      />

      {/* Search/Drag handle - hidden/disabled when collapsed */}
      {!isCollapsed && (
        <div
          className="relative group flex w-1 cursor-col-resize flex-col items-center justify-center bg-transparent transition-all hover:w-1.5 hover:bg-primary/10 active:bg-primary/20"
          onMouseDown={startResizing}
          onDoubleClick={() => setSidebarWidth(256)}
        >
          <div className="h-8 w-0.5 rounded-full bg-border opacity-0 transition-all group-hover:opacity-100 group-active:h-full group-active:opacity-50" />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col relative bg-background">
        <main className="flex-1 overflow-hidden relative">{children}</main>
      </div>
    </div>
  );
}
