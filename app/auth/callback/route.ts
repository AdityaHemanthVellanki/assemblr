import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/app/chat";

  // Use getBaseUrl to resolve the correct origin (handling proxies/ngrok)
  const origin = await getBaseUrl(request);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not defined");
  }

  // Guardrail: Ensure APP_BASE_URL is valid for the environment
  if (process.env.NODE_ENV === "production" && appUrl.includes("localhost")) {
    console.error(`[CRITICAL] NEXT_PUBLIC_APP_URL is set to localhost in production: ${appUrl}`);
    // We can't redirect safely if the base URL is wrong, but we can try relative or throw
    throw new Error("Server misconfiguration: Invalid NEXT_PUBLIC_APP_URL (localhost in production)");
  }

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
            const isSecure = process.env.NODE_ENV === "production" || origin.startsWith("https:");
            for (const c of cookiesToSet) {
              cookieStore.set(c.name, c.value, {
                ...c.options,
                secure: isSecure,
              });
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
        await supabase
          .from("profiles")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", user.id);
      }

      // Ensure next path starts with /
      const safeNext = next.startsWith("/") ? next : `/${next}`;
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_code_error`);
}
