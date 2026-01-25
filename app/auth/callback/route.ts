import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const env = getServerEnv();
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY, // Use Publishable Key for auth exchange to respect RLS/Auth flow
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
      }
    );
    
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
        // Update last_login_at
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            // We can use the admin client here to update the profile without RLS issues if needed,
            // or use the current client if RLS allows users to update their own profile.
            // Let's assume users can update their own profile or we use admin client.
            // Using admin client is safer for system updates.
            
            // However, we can't easily import createSupabaseAdminClient here if it's not exported or if we want to keep this self-contained.
            // But we have lib/supabase/admin.ts.
            // Let's use the current client first.
            
             await supabase
                .from("profiles")
                .update({ last_login_at: new Date().toISOString() })
                .eq("id", user.id);
        }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_code_error`);
}
