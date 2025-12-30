

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptJson, encryptJson } from "@/lib/security/encryption";
import { OAUTH_PROVIDERS } from "./oauthProviders";

type TokenSet = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number; // timestamp in ms
  scope?: string;
  provider_account_id?: string;
};

export async function getValidAccessToken(
  orgId: string,
  integrationId: string
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  
  // 1. Load connection
  const { data: connection, error } = await supabase
    .from("integration_connections")
    .select("encrypted_credentials")
    .eq("org_id", orgId)
    .eq("integration_id", integrationId)
    .single();

  if (error || !connection) {
    throw new Error(`No connection found for integration ${integrationId}`);
  }

  // 2. Decrypt
  let tokens: TokenSet;
  try {
    const raw = connection.encrypted_credentials as unknown;
    const enc = typeof raw === "string" ? JSON.parse(raw) : raw;
    tokens = decryptJson(enc as never) as TokenSet;
  } catch (e) {
    console.error("Token decryption failed", e);
    throw new Error("Failed to decrypt tokens");
  }

  // 3. Check Expiry (buffer of 5 minutes)
  const now = Date.now();
  const expiresAt = tokens.expires_at ?? 0;
  const isExpired = expiresAt > 0 && expiresAt < now + 5 * 60 * 1000;

  if (!isExpired) {
    return tokens.access_token;
  }

  // 4. Refresh
  const provider = OAUTH_PROVIDERS[integrationId];
  if (!provider) {
    throw new Error(`Provider configuration missing for ${integrationId}`);
  }

  if (!provider.supportsRefreshToken || !tokens.refresh_token) {
    throw new Error(`Token expired and refresh not supported/available for ${integrationId}`);
  }

  console.log(`Refreshing token for ${integrationId} (org: ${orgId})`);

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", tokens.refresh_token);
    params.append("client_id", process.env[provider.clientIdEnv] ?? "");
    params.append("client_secret", process.env[provider.clientSecretEnv] ?? "");

    const res = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: params,
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("Token refresh failed", body);
      throw new Error("Token refresh failed upstream");
    }

    const data = await res.json();
    
    // Update tokens
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token ?? tokens.refresh_token; // Keep old if not rotated
    const expiresIn = data.expires_in; // usually seconds
    const newExpiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

    const newTokens: TokenSet = {
      ...tokens,
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_at: newExpiresAt,
    };

    // 5. Encrypt & Store
    const encrypted = encryptJson(newTokens);
    
    const { error: updateError } = await supabase
      .from("integration_connections")
      .update({
        encrypted_credentials: JSON.stringify(encrypted),
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("integration_id", integrationId);

    if (updateError) {
      console.error("Failed to persist refreshed token", updateError);
      throw new Error("Failed to persist refreshed token");
    }

    return newAccessToken;

  } catch (err) {
    console.error("Refresh flow error", err);
    throw new Error("Token refresh failed");
  }
}
