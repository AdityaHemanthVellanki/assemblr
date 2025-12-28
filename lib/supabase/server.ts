import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) {
            cookieStore.set(c.name, c.value, c.options);
          }
        },
      },
    },
  );
}
