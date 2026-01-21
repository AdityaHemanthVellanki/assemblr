"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function LoadingAuthState() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let supabase: ReturnType<typeof getBrowserSupabase> | null = null;
    try {
      supabase = getBrowserSupabase();
    } catch (e) {
      console.error("Supabase initialization failed:", e);
      setTimeout(() => setError("Configuration error: Supabase environment variables missing."), 0);
      return;
    }

    async function check() {
      try {
        if (!supabase) {
          return;
        }
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          // Confirmed invalid -> redirect
          router.push("/login");
        } else {
          // Valid session (likely refreshed by middleware) -> reload to hydrate server state
          router.refresh();
        }
      } catch (err) {
        console.error("Session check failed:", err);
        router.push("/login");
      }
    }

    check();
  }, [router]);

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-destructive">
          <p className="font-bold">System Error</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Verifying session...</p>
      </div>
    </div>
  );
}
