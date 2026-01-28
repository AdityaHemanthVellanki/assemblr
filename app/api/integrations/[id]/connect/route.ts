import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/permissions";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const env = getServerEnv();
  const { id: providerId } = await params;
  
  const body = await req.json().catch(() => ({}));
  let redirectPath = body.redirectPath || "/dashboard/integrations";
  const resumeId = body.resumeId;

  if (resumeId) {
    const separator = redirectPath.includes("?") ? "&" : "?";
    redirectPath = `${redirectPath}${separator}resumeId=${resumeId}`;
  }

  if (!providerId || !OAUTH_PROVIDERS[providerId]) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const provider = OAUTH_PROVIDERS[providerId];

  // 1. Auth check
  let ctx;
  try {
    ({ ctx } = await requireOrgMember());
  } catch (err) {
    // If unauthorized
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get Client ID from Env Vars (Hosted OAuth Only)
  let clientId: string | undefined;
  let clientSecret: string | undefined;

  switch (providerId) {
    case "github": 
      clientId = env.GITHUB_CLIENT_ID; 
      clientSecret = env.GITHUB_CLIENT_SECRET;
      break;
    case "slack": 
      clientId = env.SLACK_CLIENT_ID; 
      clientSecret = env.SLACK_CLIENT_SECRET;
      break;
    case "notion": 
      clientId = env.NOTION_CLIENT_ID; 
      clientSecret = env.NOTION_CLIENT_SECRET;
      break;
    case "linear": 
      clientId = env.LINEAR_CLIENT_ID; 
      clientSecret = env.LINEAR_CLIENT_SECRET;
      break;
    case "google": 
      clientId = env.GOOGLE_CLIENT_ID; 
      clientSecret = env.GOOGLE_CLIENT_SECRET;
      break;
  }

  if (!clientId || !clientSecret) {
    console.error(`Missing hosted credentials for ${providerId}`);
    return NextResponse.json({ error: `Server configuration error: Missing Client ID or Secret for ${provider.name}.` }, { status: 500 });
  }

  // 3. Generate State
  const state = crypto.randomBytes(32).toString("hex");
  const statePayload = JSON.stringify({
    state,
    orgId: ctx.orgId,
    providerId,
    redirectPath,
    resumeId,
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
  const oauthParams = new URLSearchParams();
  oauthParams.append("response_type", "code");
  oauthParams.append("client_id", clientId);

  // Redirect URI strategy
  // Use the same callback endpoint
  const redirectBase = env.APP_BASE_URL;
  const redirectUri = `${redirectBase}/api/oauth/callback/${providerId}`;

  oauthParams.append("redirect_uri", redirectUri);
  oauthParams.append("state", state);

  if (provider.scopes.length > 0) {
    oauthParams.append("scope", provider.scopes.join(provider.scopeSeparator ?? " "));
  }

  if (provider.extraAuthParams) {
    for (const [k, v] of Object.entries(provider.extraAuthParams)) {
      oauthParams.append(k, v);
    }
  }

  const authUrl = `${provider.authUrl}?${oauthParams.toString()}`;

  return NextResponse.json({ redirectUrl: authUrl });
}
