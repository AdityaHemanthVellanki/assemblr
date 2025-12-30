import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/auth/permissions";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptJson } from "@/lib/security/encryption";

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

  // 2. Fetch User Configured Credentials
  const supabase = await createSupabaseServerClient();
  const { data: connection, error: connectionError } = await supabase
    .from("integration_connections")
    .select("encrypted_credentials")
    .eq("org_id", ctx.orgId)
    .eq("integration_id", providerId)
    .single();

  if (connectionError || !connection) {
    return NextResponse.json(
      { error: "Integration not configured. Please enter your App Credentials in the Integrations settings." },
      { status: 400 }
    );
  }

  let clientId: string;
  try {
    const creds = decryptJson(JSON.parse(connection.encrypted_credentials)) as Record<string, unknown>;
    clientId = creds.clientId as string;
    if (!clientId) throw new Error("Missing Client ID");
  } catch (err) {
    console.error("Failed to decrypt oauth credentials", err);
    return NextResponse.json(
      { error: "Invalid integration configuration. Please reconnect." },
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
  
  // BYOO: We use the current origin as the redirect base. 
  // Users must register this exact origin in their OAuth app.
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
