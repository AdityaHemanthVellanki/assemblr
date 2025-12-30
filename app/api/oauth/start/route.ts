import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/auth/permissions";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";

export async function GET(req: Request) {
  getServerEnv();

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const redirectPath = url.searchParams.get("redirectPath") ?? "/dashboard";

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

  // 2. Generate State
  const state = crypto.randomBytes(32).toString("hex");
  const statePayload = JSON.stringify({
    state,
    orgId: ctx.orgId,
    providerId,
    redirectPath,
  });

  // 3. Store State in Cookie (HTTP Only, Secure)
  // We sign/encrypt the cookie implicitly by relying on server-side state verification? 
  // Actually, to be stateless, we just verify the random string. 
  // But we need to recover orgId/redirectPath in the callback.
  // So we store the payload in the cookie.
  const cookieStore = await cookies();
  cookieStore.set("oauth_state", statePayload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  });

  // 4. Build Auth URL
  const clientId = process.env[provider.clientIdEnv];
  if (!clientId) {
    return NextResponse.json({ error: "Provider not configured" }, { status: 500 });
  }

  const params = new URLSearchParams();
  params.append("response_type", "code");
  params.append("client_id", clientId);
  // Redirect URI is the callback endpoint
  const redirectUri = `${url.origin}/api/oauth/callback/${providerId}`;
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
