import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const getServerClient = cache(async (cookieStore?: any) => {
  const env = getServerEnv();
  const cStore = cookieStore || await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    cookies: {
      getAll() {
        return cStore.getAll();
      },
      setAll() {},
    },
  });
});

export async function createSupabaseServerClient(cookieStore?: any) {
  return getServerClient(cookieStore);
}
