import Link from "next/link";
import { LayoutDashboard, Users } from "lucide-react";

import { cn } from "@/lib/ui/cn";
import { roleLabel, type OrgRole } from "@/lib/auth/permissions";

export function Sidebar({
  className,
  role,
}: {
  className?: string;
  role: OrgRole;
}) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 flex-col border-r border-border",
        className,
      )}
    >
      <div className="flex h-14 items-center px-4 text-sm font-semibold">
        Assemblr
      </div>
      <nav className="flex flex-col gap-1 px-2 py-2 text-sm">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground"
        >
          <LayoutDashboard className="h-4 w-4" />
          Projects
        </Link>
        <Link
          href="/dashboard/members"
          className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-accent hover:text-accent-foreground"
        >
          <Users className="h-4 w-4" />
          Members
        </Link>
      </nav>
      <div className="mt-auto border-t border-border p-4">
        <div className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          {roleLabel(role)}
        </div>
      </div>
    </aside>
  );
}
