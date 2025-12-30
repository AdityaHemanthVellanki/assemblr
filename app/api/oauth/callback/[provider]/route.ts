import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptJson } from "@/lib/security/encryption";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  getServerEnv();
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `OAuth Error: ${error}` }, { status: 400 });
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 });
  }

  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  // 1. Verify State
  const cookieStore = await cookies();
  const storedStateRaw = cookieStore.get("oauth_state")?.value;

  if (!storedStateRaw) {
    return NextResponse.json({ error: "State cookie missing or expired" }, { status: 400 });
  }

  let storedState: { state: string; orgId: string; providerId: string; redirectPath: string };
  try {
    storedState = JSON.parse(storedStateRaw);
  } catch {
    return NextResponse.json({ error: "Invalid state cookie" }, { status: 400 });
  }

  if (storedState.state !== state) {
    return NextResponse.json({ error: "State mismatch (CSRF warning)" }, { status: 400 });
  }

  if (storedState.providerId !== providerId) {
    return NextResponse.json({ error: "Provider mismatch" }, { status: 400 });
  }

  // Clear cookie
  cookieStore.delete("oauth_state");

  const supabase = createSupabaseAdminClient();

  // 2. Retrieve Credentials from Env Vars (Hosted OAuth Only)
  const idKey = `${providerId.toUpperCase()}_CLIENT_ID`;
  const secretKey = `${providerId.toUpperCase()}_CLIENT_SECRET`;
  const clientId = process.env[idKey] || "";
  const clientSecret = process.env[secretKey] || "";

  if (!clientId || !clientSecret) {
    console.error(`Missing hosted credentials for ${providerId}`);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  try {
    // Reconstruct Redirect URI
    const redirectBase = url.origin;
    const redirectUri = `${redirectBase}/api/oauth/callback/${providerId}`;

    const body = new URLSearchParams();
    body.append("grant_type", "authorization_code");
    body.append("code", code);
    body.append("redirect_uri", redirectUri);
    body.append("client_id", clientId);
    body.append("client_secret", clientSecret);

    const tokenRes = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed", errText);
      return NextResponse.json({ error: "Token exchange failed upstream" }, { status: 502 });
    }

    const tokens = await tokenRes.json();

    // Validate tokens
    if (!tokens.access_token) {
      console.error("Invalid token response", tokens);
      return NextResponse.json({ error: "Invalid token response" }, { status: 502 });
    }

    // Normalize
    const expiresIn = tokens.expires_in; // seconds
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

    let providerAccountId = tokens.id_token ? "parsed_from_id_token" : undefined;
    
    // Stripe specific: use stripe_user_id
    if (providerId === "stripe" && tokens.stripe_user_id) {
      providerAccountId = tokens.stripe_user_id;
    }

    const tokenSet = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      provider_account_id: providerAccountId,
      updated_at: new Date().toISOString(),
      // Store raw stripe_user_id if available (critical for Stripe)
      stripe_user_id: tokens.stripe_user_id,
    };

    // 3. Store Updated Credentials and Activate
    const encrypted = encryptJson(tokenSet);

    // Upsert the connection
    const { error: upsertError } = await supabase
      .from("integration_connections")
      .upsert(
        {
          org_id: storedState.orgId,
          integration_id: providerId,
          encrypted_credentials: JSON.stringify(encrypted),
          status: "active",
          source: "oauth_callback",
          oauth_client_id: null, // Hosted doesn't store client ID in DB
          // @ts-ignore - column added in migration
          provider_account_id: providerAccountId,
        },
        { onConflict: "org_id,integration_id" }
      );

    if (upsertError) {
      console.error("Failed to store tokens", upsertError);
      return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
    }

    // 4. Redirect
    const successUrl = new URL(storedState.redirectPath, req.url);
    successUrl.searchParams.set("integration_connected", "true");
    return NextResponse.redirect(successUrl);

  } catch (err) {
    console.error("OAuth callback error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
