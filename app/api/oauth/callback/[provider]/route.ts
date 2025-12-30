import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  // 2. Exchange Code
  const clientId = process.env[provider.clientIdEnv];
  const clientSecret = process.env[provider.clientSecretEnv];

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Provider config missing" }, { status: 500 });
  }

  try {
    const redirectUri = `${url.origin}/api/oauth/callback/${providerId}`;
    
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
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      provider_account_id: tokens.id_token ? "parsed_from_id_token" : undefined, // Simplify for now
    };

    // 3. Store
    const encrypted = encryptJson(tokenSet);
    const supabase = await createSupabaseServerClient();
    
    // Upsert
    const { error: upsertError } = await supabase
      .from("integration_connections")
      .upsert({
        org_id: storedState.orgId,
        integration_id: providerId,
        encrypted_credentials: JSON.stringify(encrypted),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "org_id,integration_id"
      });

    if (upsertError) {
      console.error("Failed to store tokens", upsertError);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // 4. Redirect
    return NextResponse.redirect(new URL(storedState.redirectPath, req.url));

  } catch (err) {
    console.error("OAuth callback error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
