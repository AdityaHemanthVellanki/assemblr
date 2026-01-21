"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export function LoadingAuthState() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    async function check() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        // Confirmed invalid -> redirect
        router.push("/login");
      } else {
        // Valid session (likely refreshed by middleware) -> reload to hydrate server state
        router.refresh();
      }
    }

    check();
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Verifying session...</p>
      </div>
    </div>
  );
}
