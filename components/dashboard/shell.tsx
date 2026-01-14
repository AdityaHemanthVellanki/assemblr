import * as React from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import type { OrgRole } from "@/lib/auth/permissions.client";

export function DashboardShell({
  children,
  role,
}: {
  children: React.ReactNode;
  role: OrgRole;
}) {
  return (
    <div className="flex h-dvh bg-background text-foreground">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col relative">
        {/* We removed the global Topbar to match the clean canvas design. 
            Pages are responsible for their own headers (like the Share/Avatar row). */}
        <main className="flex-1 overflow-hidden relative">{children}</main>
      </div>
    </div>
  );
}
