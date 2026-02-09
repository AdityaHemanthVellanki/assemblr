import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getServerEnv } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import type { Database } from "@/lib/supabase/database.types";

export async function GET(request: Request) {
  console.log("[AuthCallback] Hit with URL:", request.url);
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/app/chat";

  console.log("[AuthCallback] Code present:", !!code);


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
      env.SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            const isSecure = requestUrl.protocol === "https:";
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

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      console.log("[AuthCallback] Session exchange successful");
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log("[AuthCallback] User authenticated:", user.email);
        await supabase
          .from("profiles")
          .update({ last_login_at: new Date().toISOString() })
          .eq("id", user.id);
      }

      const safeNext = next.startsWith("/") ? next : `/${next}`;
      const finalUrl = `${origin}${safeNext}`;
      console.log("[AuthCallback] Redirecting to:", finalUrl);
      return NextResponse.redirect(finalUrl);
    } else {
      console.error("[AuthCallback] Code exchange failed:", exchangeError);
      console.error("[AuthCallback] Code:", code ? "PRESENT" : "MISSING");
      console.error("[AuthCallback] Origin:", requestUrl.origin);
    }
  } else {
    console.error("[AuthCallback] No code provided in query params");
  }

  return NextResponse.redirect(`${origin}/login?error=auth_code_error`);
}
