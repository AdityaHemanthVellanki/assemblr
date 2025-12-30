import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptJson, decryptJson } from "@/lib/security/encryption";

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

  // 2. Fetch Credentials from DB
  const supabase = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await supabase
    .from("integration_connections")
    .select("id, encrypted_credentials")
    .eq("org_id", storedState.orgId)
    .eq("integration_id", providerId)
    .single();

  if (connectionError || !connection) {
    console.error("Connection not found for callback", { orgId: storedState.orgId, providerId });
    return NextResponse.json({ error: "Integration configuration not found" }, { status: 400 });
  }

  let clientId: string;
  let clientSecret: string;
  let existingCreds: Record<string, unknown>;

  try {
    existingCreds = decryptJson(JSON.parse(connection.encrypted_credentials)) as Record<string, unknown>;
    clientId = existingCreds.clientId as string;
    clientSecret = existingCreds.clientSecret as string;
    if (!clientId || !clientSecret) throw new Error("Missing Client ID or Secret");
  } catch (err) {
    console.error("Failed to decrypt credentials during callback", err);
    return NextResponse.json({ error: "Invalid integration configuration" }, { status: 500 });
  }

  try {
    // Reconstruct Redirect URI
    // BYOO: Use current origin
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
    
    const tokenSet = {
      ...existingCreds, // Preserve Client ID/Secret
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      provider_account_id: tokens.id_token ? "parsed_from_id_token" : undefined, 
      updated_at: new Date().toISOString(),
    };

    // 3. Store Updated Credentials and Activate
    const encrypted = encryptJson(tokenSet);
    
    const { error: updateError } = await supabase
      .from("integration_connections")
      .update({ 
        encrypted_credentials: JSON.stringify(encrypted),
        status: 'active' 
      })
      .eq("id", connection.id);

    if (updateError) {
      console.error("Failed to store tokens", updateError);
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
