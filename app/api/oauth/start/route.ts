import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/permissions";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ... imports
import { getBroker } from "@/lib/broker";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const env = getServerEnv();
  const baseUrl = await getBaseUrl(req);
  console.log(`[OAuth Start] Resolved Base URL: ${baseUrl}`);

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const resumeId = url.searchParams.get("resumeId");

  if (!resumeId) {
    console.error(`[OAuth Start] CRITICAL: Missing resumeId. Request URL: ${req.url}`);
    const errorUrl = new URL("/error", baseUrl);
    errorUrl.searchParams.set("title", "Integration Error");
    errorUrl.searchParams.set("message", "Missing context for integration. Please try again from the chat.");
    return NextResponse.redirect(errorUrl);
  }

  // Helper to redirect with error
  const redirectWithError = (msg: string) => {
    const targetUrl = new URL("/dashboard", baseUrl);
    targetUrl.searchParams.set("error", msg);
    return NextResponse.redirect(targetUrl);
  };

  if (!providerId) {
    return redirectWithError("Invalid provider");
  }

  // 1. Auth check
  let ctx;
  try {
    ({ ctx } = await requireOrgMember());
  } catch {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  try {
    const broker = getBroker();

    // 2. Initiate Connection via Broker
    // This generates the Auth URL and State
    const { authUrl, state, codeVerifier } = await broker.initiateConnection(
      ctx.orgId,
      ctx.userId,
      providerId,
      "/", // returnPath is ignored by DIY broker initiation logic (context has it)
      resumeId
    );

    const cookieStore = await cookies();
    const isSecure = process.env.NODE_ENV === "production";

    // 3. Store State in Cookie (CSRF Protection)
    // We store the exact state string that was sent to the provider.
    // In callback, we will verify cookie value == param value.
    cookieStore.set("oauth_state", state, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      maxAge: 60 * 10, // 10 minutes
      path: "/",
    });

    // 4. Store PKCE verifier if present
    if (codeVerifier) {
      cookieStore.set("oauth_pkce", codeVerifier, {
        httpOnly: true,
        secure: isSecure,
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/",
      });
    }

    console.log(`[OAuth Start] Redirecting to ${providerId}. State: ${state.substring(0, 10)}...`);
    return NextResponse.redirect(authUrl);

  } catch (error: any) {
    console.error("[OAuth Start] Initialization Error:", error);
    return redirectWithError(error.message || "Failed to start integration flow");
  }
}
