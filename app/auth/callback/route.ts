import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

async function createRouteHandlerSupabaseClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = await createRouteHandlerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent("auth_failed")}`, url.origin),
    );
  }

  // Phase 13: Ensure Org Context exists before redirecting
  // This prevents the "Workspace provisioning" race condition on first login
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Check if membership exists
      // @ts-ignore
      const { data: membership } = await (supabase.from("memberships") as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership) {
        // Wait briefly for trigger
        await new Promise(r => setTimeout(r, 1000));
        
        // Check again
        // @ts-ignore
        const { data: retry } = await (supabase.from("memberships") as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
        
        if (!retry) {
           // If still missing, we could force provision here, but `getSessionContext` handles it too.
           // We'll let the Dashboard handle the final check/loading state.
           console.log("OAuth Callback: Membership pending for user", user.id);
        }
      }
    }
  } catch (err) {
    console.error("OAuth Callback: Failed to verify membership", err);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
