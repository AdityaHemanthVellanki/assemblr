import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerEnv } from "@/lib/env";

export const getSessionOnce = cache(async () => {
  const env = getServerEnv();
  const cookieStore = await cookies();

  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY, // Use PUBLISHABLE key for client-side auth context
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

  // Validate the user with the auth service (more secure than getSession)
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) {
      // console.warn("[getSessionOnce] Auth error:", error.message);
      return null;
  }
  
  if (!user) {
      return null;
  }
  
  // Return a session-like object for compatibility
  return {
      user,
      access_token: null, // Not available via getUser, but usually not needed for server checks
      refresh_token: null,
      expires_in: 0,
      token_type: 'bearer',
      user_id: user.id
  } as any;
});
