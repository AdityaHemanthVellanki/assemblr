import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/auth/permissions";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const redirectPath = url.searchParams.get("redirectPath") ?? "/dashboard";
  // Source tracking (optional, but good for analytics/debugging)
  // const source = url.searchParams.get("source") ?? "settings";

  if (!providerId || !OAUTH_PROVIDERS[providerId]) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const provider = OAUTH_PROVIDERS[providerId];

  // 1. Auth check
  let ctx;
  try {
    ({ ctx } = await requireOrgMember());
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get Client ID from Env Vars (Hosted OAuth Only)
  // Normalize provider ID to env var format (e.g. google -> GOOGLE_CLIENT_ID)
  const envKey = `${providerId.toUpperCase()}_CLIENT_ID`;
  const clientId = process.env[envKey];

  if (!clientId) {
    console.error(`Missing hosted client ID for ${providerId} (expected env: ${envKey})`);
    return NextResponse.json(
      { error: `Server configuration error: Missing Client ID for ${provider.name}` },
      { status: 500 }
    );
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
  const redirectBase = url.origin;
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
