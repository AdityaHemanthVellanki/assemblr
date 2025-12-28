import * as React from "react";

import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import type { OrgRole } from "@/lib/auth/permissions";

export function DashboardShell({
  children,
  role,
}: {
  children: React.ReactNode;
  role: OrgRole;
}) {
  return (
    <div className="flex h-dvh">
      <Sidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar role={role} />
        <main className="min-w-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
