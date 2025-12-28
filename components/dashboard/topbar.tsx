import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/auth/sign-out-button";

export function Topbar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-4">
      <div className="text-sm font-medium text-muted-foreground">
        Internal dashboard tooling
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
