import Link from "next/link";

import { Button } from "@/components/ui/button";

export default async function Home() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <main className="w-full max-w-3xl px-6 py-16">
        <div className="space-y-4">
          <div className="text-sm font-medium text-muted-foreground">
            Assemblr
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">
            Natural language → internal dashboards
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Stage 0 ships a secure foundation: auth, org-aware users, and a
            production-grade codebase structure. Dashboard generation comes
            next.
          </p>
        </div>

        <div className="mt-8 flex items-center gap-3">
          <Button asChild>
            <Link href="/app/chat">Go to app</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/signup">Sign up</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
