import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/auth/permissions";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";

export async function GET(req: Request) {
  const env = getServerEnv();
  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const redirectPath = url.searchParams.get("redirectPath") ?? "/dashboard";

  // Helper to redirect with error
  const redirectWithError = (msg: string) => {
    const targetUrl = new URL(redirectPath, env.APP_BASE_URL);
    targetUrl.searchParams.set("error", msg);
    return NextResponse.redirect(targetUrl);
  };

  if (!providerId || !OAUTH_PROVIDERS[providerId]) {
    return redirectWithError("Invalid provider");
  }

  const provider = OAUTH_PROVIDERS[providerId];

  // 1. Auth check
  let ctx;
  try {
    ({ ctx } = await requireOrgMember());
  } catch {
    // If unauthorized, redirect to login
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // 2. Get Client ID from Env Vars (Hosted OAuth Only)
  // Normalize provider ID to env var format (e.g. google -> GOOGLE_CLIENT_ID)
  const envKey = `${providerId.toUpperCase()}_CLIENT_ID`;
  // We use the validated env here, not process.env
  // But env is typed with specific keys. We need to cast or access dynamically safely.
  // Since we validated them in lib/env/server.ts, we can trust they exist if the app started.
  // However, to satisfy TS and be explicit:
  let clientId: string | undefined;

  switch (providerId) {
    case "github": clientId = env.GITHUB_CLIENT_ID; break;
    case "slack": clientId = env.SLACK_CLIENT_ID; break;
    case "notion": clientId = env.NOTION_CLIENT_ID; break;
    case "linear": clientId = env.LINEAR_CLIENT_ID; break;
    case "google": clientId = env.GOOGLE_CLIENT_ID; break;
  }

  if (!clientId) {
    console.error(`Missing hosted client ID for ${providerId}`);
    return redirectWithError(`Server configuration error: Missing Client ID for ${provider.name}`);
  }

  // 3. Generate State
  const state = crypto.randomBytes(32).toString("hex");
  const statePayload = JSON.stringify({
    state,
    orgId: ctx.orgId,
    providerId,
    redirectPath,
  });

  // 4. Store State in Cookie (HTTP Only, Secure)
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", statePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  // 5. Build Auth URL
  const params = new URLSearchParams();
  params.append("response_type", "code");
  params.append("client_id", clientId);

  // Redirect URI strategy
  // Use the same callback endpoint
  const redirectBase = env.APP_BASE_URL;
  const redirectUri = `${redirectBase}/api/oauth/callback/${providerId}`;

  params.append("redirect_uri", redirectUri);
  params.append("state", state);

  if (provider.scopes.length > 0) {
    params.append("scope", provider.scopes.join(provider.scopeSeparator ?? " "));
  }

  if (provider.extraAuthParams) {
    for (const [k, v] of Object.entries(provider.extraAuthParams)) {
      params.append(k, v);
    }
  }

  return NextResponse.redirect(`${provider.authUrl}?${params.toString()}`);
}
