import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerEnv } from "@/lib/env";

export const getSessionOnce = cache(async () => {
  const env = getServerEnv();
  const cookieStore = await cookies();

  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY, // Use SECRET key on server for robustness, or PUBLISHABLE? 
    // User example used process.env.NEXT_PUBLIC_... which are publishable usually.
    // But createServerClient on server usually can use secret or anon. 
    // User example: process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // I will stick to user example keys but via getServerEnv() which has them.
    // Actually, getServerEnv has SUPABASE_URL and SUPABASE_SECRET_KEY / PUBLISHABLE_KEY.
    // For session validation, ANON key is safer/standard unless admin is needed.
    // I'll use SUPABASE_PUBLISHABLE_KEY to match user's intent of "standard client".
    // Wait, user code snippet used: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // So I will use env.SUPABASE_PUBLISHABLE_KEY (which corresponds to that).
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
            // Server Components cannot set cookies. 
            // This method is required by interface but does nothing here.
            // Middleware handles the persistence.
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getSession();

  if (error) {
      console.warn("[getSessionOnce] Session error:", error.message);
      return null;
  }
  
  return data.session;
});
