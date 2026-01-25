import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { roleLabel, type OrgRole } from "@/lib/permissions-shared";

export function Topbar({ role }: { role: OrgRole }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4">
      <div className="text-sm font-medium text-muted-foreground">
        Internal dashboard tooling
      </div>
      <div className="flex items-center gap-2">
        <div className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
          {roleLabel(role)}
        </div>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
