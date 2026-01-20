
import { decryptJson, encryptJson } from "@/lib/security/encryption";
import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";

export async function getValidAccessToken(orgId: string, integrationId: string): Promise<string> {
  let connection: any;
  let supabase: any;
  try {
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    supabase = await createSupabaseServerClient();
    const res = await supabase
      .from("integration_connections")
      .select("encrypted_credentials, updated_at")
      .eq("org_id", orgId)
      .eq("integration_id", integrationId)
      .single();
    connection = res.data;
    if (res.error) {
      throw res.error;
    }
  } catch (e) {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    supabase = createSupabaseAdminClient();
    const res = await (supabase.from("integration_connections") as any)
      .select("encrypted_credentials, updated_at")
      .eq("org_id", orgId)
      .eq("integration_id", integrationId)
      .single();
    connection = res.data;
    if (res.error) {
      throw res.error;
    }
  }

  if (!connection) {
    throw new Error(`Integration ${integrationId} not connected`);
  }

  let encrypted = (connection as any).encrypted_credentials;
  if (typeof encrypted === "string") {
    try {
      encrypted = JSON.parse(encrypted);
    } catch (e) {
      throw new Error(`Failed to parse encrypted_credentials for ${integrationId}`);
    }
  }

  const credentials = decryptJson(encrypted) as any;
  
  const accessToken = credentials.access_token;
  const refreshToken = credentials.refresh_token;
  const expiresAt = credentials.expires_at; // timestamp in ms

  // Check if expired or expiring in 5 minutes
  if (expiresAt && Date.now() > expiresAt - 5 * 60 * 1000) {
      if (!refreshToken) {
          console.warn(`Token expired for ${integrationId} and no refresh token available`);
          throw new Error(`Access token expired for ${integrationId} and no refresh token available. Re-connection required.`);
      }

      console.log(`Refreshing token for ${integrationId}...`);
      const provider = OAUTH_PROVIDERS[integrationId];
      if (!provider) throw new Error(`Unknown provider ${integrationId}`);

      if (!provider.supportsRefreshToken) {
           throw new Error(`Provider ${integrationId} does not support token refresh but token is expired.`);
      }

      const env = getServerEnv();
      // Dynamically access client ID/Secret based on integration ID
      // Note: This relies on the naming convention INTEGRATION_CLIENT_ID
      const envKeyId = `${integrationId.toUpperCase()}_CLIENT_ID` as keyof typeof env;
      const envKeySecret = `${integrationId.toUpperCase()}_CLIENT_SECRET` as keyof typeof env;
      
      const clientId = env[envKeyId];
      const clientSecret = env[envKeySecret];

      if (!clientId || !clientSecret) {
          throw new Error(`Missing credentials for ${integrationId}`);
      }

      const params = new URLSearchParams();
      params.append("client_id", clientId as string);
      params.append("client_secret", clientSecret as string);
      params.append("refresh_token", refreshToken);
      params.append("grant_type", "refresh_token");

      const res = await fetch(provider.tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params
      });

      if (!res.ok) {
          const errText = await res.text();
          console.error("Token refresh failed", errText);
          throw new Error(`Failed to refresh token for ${integrationId}: ${res.statusText}`);
      }

      const newTokens = await res.json();
      
      // Update credentials
      const newAccessToken = newTokens.access_token;
      const newExpiresIn = newTokens.expires_in; // seconds
      const newExpiresAt = newExpiresIn ? Date.now() + newExpiresIn * 1000 : undefined;
      
      // Some providers rotate refresh tokens too
      const newRefreshToken = newTokens.refresh_token || refreshToken;

      const updatedCredentials = {
          ...credentials,
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_at: newExpiresAt,
          updated_at: new Date().toISOString()
      };

      // Save to DB
      const encrypted = encryptJson(updatedCredentials);
      const { error: updateError } = await supabase
          .from("integration_connections")
          .update({ 
              encrypted_credentials: JSON.stringify(encrypted),
              updated_at: new Date().toISOString()
          })
          .eq("org_id", orgId)
          .eq("integration_id", integrationId);

      if (updateError) {
          console.error("Failed to save refreshed token", updateError);
          // We continue because we have the valid token in memory
      }
      
      return newAccessToken;
  }

  return accessToken;
}
