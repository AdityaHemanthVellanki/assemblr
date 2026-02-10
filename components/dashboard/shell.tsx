"use client";

import * as React from "react";
import { Sidebar } from "@/components/dashboard/sidebar";

export function DashboardShell({
  children,
}: {
  children: React.ReactNode;
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
      {/* Sidebar Container */}
      <div
        style={{ width: isCollapsed ? "auto" : sidebarWidth }}
        className="flex-shrink-0 relative flex flex-col border-r border-border bg-card/30"
      >
        <Sidebar
          isCollapsed={isCollapsed}
          onToggleCollapse={toggleCollapsed}
          role="viewer"
        />

        {/* Resize Handle */}
        {!isCollapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-50 hover:bg-primary/50 transition-colors"
            onMouseDown={startResizing}
            onDoubleClick={() => setSidebarWidth(256)}
          />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col relative bg-background">
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative">{children}</main>
      </div>
    </div>
  );
}
