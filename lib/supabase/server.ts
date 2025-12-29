import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
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
