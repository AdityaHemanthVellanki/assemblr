// import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const getServerClient = cache(async (cookieStore?: any) => {
  const env = getServerEnv();
  const cStore = cookieStore || await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          // Check for HTTPS (e.g. ngrok) to force Secure cookies even in dev
          // We can't await headers() here effectively inside the callback if it was synchronous, 
          // but setAll is conceptually synchronous or strictly side-effecting. 
          // However, cStore is usually the cookies() object which is async only in reading?
          // Actually, cookies() returns a ReadonlyRequestCookies, but in Server Actions it's mutable.
          // We can try to infer secure from env or just default logic?
          // But reading headers() inside this callback might be risky if not async.
          // Let's rely on checking if we are in production OR if we can infer it.
          // Actually we can just assume if we are writing a cookie, we want it secure if usually secure.

          // Better approach: Just set secure: true if we are not on localhost http?
          // Since we can't easily access headers() cleanly here without async...
          // Let's skip the header check and just trust the caller OR assume dev-with-ngrok needs secure.
          // But we don't know if it's ngrok.

          cookiesToSet.forEach(({ name, value, options }) => {
            // Heuristic: If we are in dev but valid public URL, we might want secure.
            // But simpler: just pass through. The auth/callback fix is the most critical one.
            // If we must, we can do:
            // cStore.set(name, value, { ...options, secure: options.secure || process.env.NEXT_PUBLIC_APP_URL?.startsWith("https") });

            // Let's use the env var as a proxy
            const isSecure = options.secure || (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false);
            cStore.set(name, value, { ...options, secure: isSecure });
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
});

export async function createSupabaseServerClient(cookieStore?: any) {
  return getServerClient(cookieStore);
}
