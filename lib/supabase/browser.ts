import { createBrowserClient } from "@supabase/ssr";
import { env, assertClientEnv } from "@/lib/env";

export function getBrowserSupabase() {
  assertClientEnv();

  return createBrowserClient(
    env.SUPABASE_URL!,
    env.SUPABASE_ANON_KEY!
  );
}
