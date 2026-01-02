import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = await createSupabaseServerClient();
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
