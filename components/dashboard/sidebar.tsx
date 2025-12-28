import Link from "next/link";
import { LayoutDashboard } from "lucide-react";

import { cn } from "@/lib/ui/cn";

export function Sidebar({ className }: { className?: string }) {
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
      </nav>
    </aside>
  );
}
