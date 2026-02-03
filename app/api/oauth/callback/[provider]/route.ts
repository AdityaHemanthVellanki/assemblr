import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptJson } from "@/lib/security/encryption";

import { fetchAndPersistSchemas } from "@/lib/schema/store";
import { testIntegrationConnection } from "@/lib/integrations/testIntegration";
import { getIntegrationUIConfig } from "@/lib/integrations/registry";
import { getResumeContext } from "@/app/actions/oauth";

export const dynamic = "force-dynamic";

function normalizeScopes(scopes: string[] | string | null | undefined) {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.filter(Boolean);
  return scopes
    .split(/[ ,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const env = getServerEnv();
  const { provider: providerId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  // Helper to redirect with error
  const redirectWithError = (msg: string, path = "/dashboard") => {
    const targetUrl = new URL(path, env.APP_BASE_URL);
    targetUrl.searchParams.set("error", msg);
    return NextResponse.redirect(targetUrl);
  };

  if (error) {
    return redirectWithError(`OAuth Error: ${error}`);
  }

  if (!code || !state) {
    return redirectWithError("Missing code or state");
  }

  const provider = OAUTH_PROVIDERS[providerId];
  if (!provider) {
    return redirectWithError("Invalid provider");
  }

  // 1. Verify State
  const cookieStore = await cookies();
  const storedStateRaw = cookieStore.get("oauth_state")?.value;

  if (!storedStateRaw) {
    return redirectWithError("State cookie missing or expired");
  }

  let storedState: { state: string; orgId: string; providerId: string; redirectPath: string; resumeId?: string };
  try {
    storedState = JSON.parse(storedStateRaw);
  } catch {
    return redirectWithError("Invalid state cookie");
  }

  if (storedState.state !== state) {
    return redirectWithError("State mismatch (CSRF warning)");
  }

  if (storedState.providerId !== providerId) {
    return redirectWithError("Provider mismatch");
  }

  // Clear cookie
  cookieStore.delete("oauth_state");

  const supabase = createSupabaseAdminClient();

  // 2. Retrieve Credentials from Env Vars (Hosted OAuth Only)
  const idKey = `${providerId.toUpperCase()}_CLIENT_ID`;
  const secretKey = `${providerId.toUpperCase()}_CLIENT_SECRET`;
  
  // We use the validated env here, not process.env
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
    return redirectWithError("Server configuration error", storedState?.redirectPath);
  }

  try {
    // Reconstruct Redirect URI
    const redirectBase = env.APP_BASE_URL;
    const redirectUri = `${redirectBase}/api/oauth/callback/${providerId}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    };
    let body: URLSearchParams | string;

    if (providerId === "notion") {
      // Notion requires Basic Auth + JSON body
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${auth}`;
      headers["Content-Type"] = "application/json";
      
      body = JSON.stringify({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
      });
    } else if (providerId === "linear") {
      // Linear requires application/x-www-form-urlencoded with client credentials in body
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      body = params;
    } else if (providerId === "google") {
      // Google requires application/x-www-form-urlencoded
      const params = new URLSearchParams();
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);
      params.append("code", code);
      params.append("grant_type", "authorization_code");
      params.append("redirect_uri", redirectUri);
      body = params;
    } else {
      // Others use form-urlencoded body
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("redirect_uri", redirectUri);
      params.append("client_secret", clientSecret);
      params.append("client_id", clientId);
      body = params;
    }

    const tokenRes = await fetch(provider.tokenUrl, {
      method: "POST",
      headers,
      body: body,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed", errText);
      console.error("Request Headers:", JSON.stringify({ ...headers, Authorization: "REDACTED" }));
      return redirectWithError("Authorization failed with provider", storedState.redirectPath);
    }

    const tokens = await tokenRes.json();

    // Validate tokens
    if (providerId === "slack" && !tokens.ok) {
      console.error("Slack OAuth failed", tokens);
      return redirectWithError(`Slack Error: ${tokens.error}`, storedState.redirectPath);
    }

    if (!tokens.access_token) {
      console.error("Invalid token response", tokens);
      return redirectWithError("Invalid response from provider", storedState.redirectPath);
    }

    // Normalize
    const expiresIn = tokens.expires_in; // seconds
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : undefined;

    let providerAccountId = tokens.id_token ? "parsed_from_id_token" : undefined;
    let githubUser: { id: number; login: string } | undefined;
    let slackInfo: { team_id: string; team_name: string; bot_user_id: string } | undefined;
    let notionInfo: { workspace_id: string; workspace_name: string; bot_id: string; owner_user_id?: string } | undefined;
    let linearInfo: { workspace_id: string; workspace_name: string } | undefined;
    let googleInfo: { google_user_id: string; email: string } | undefined;

    // Fetch GitHub identity if applicable
    if (providerId === "github") {
      const userRes = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          Accept: "application/json",
          "User-Agent": "Assemblr-OAuth",
        },
      });

      if (!userRes.ok) {
        console.error("Failed to fetch GitHub user", await userRes.text());
        return redirectWithError("Failed to fetch GitHub identity", storedState.redirectPath);
      }

      const userData = await userRes.json();
      if (!userData.id) {
        console.error("Invalid GitHub user response", userData);
        return redirectWithError("Invalid GitHub identity", storedState.redirectPath);
      }

      githubUser = { id: userData.id, login: userData.login };
      providerAccountId = String(userData.id);
    } else if (providerId === "slack") {
      // Slack returns team info in the token response
      if (!tokens.team?.id) {
        console.error("Invalid Slack token response (missing team)", tokens);
        return redirectWithError("Invalid Slack identity", storedState.redirectPath);
      }
      providerAccountId = tokens.team.id;
      slackInfo = {
        team_id: tokens.team.id,
        team_name: tokens.team.name,
        bot_user_id: tokens.bot_user_id,
      };
    } else if (providerId === "notion") {
      // Notion returns workspace info in the token response
      if (!tokens.workspace_id) {
        console.error("Invalid Notion token response (missing workspace_id)", tokens);
        return redirectWithError("Invalid Notion identity", storedState.redirectPath);
      }
      providerAccountId = tokens.workspace_id;
      notionInfo = {
        workspace_id: tokens.workspace_id,
        workspace_name: tokens.workspace_name || "Notion Workspace",
        bot_id: tokens.bot_id,
        owner_user_id: tokens.owner?.user?.id,
      };
    } else if (providerId === "linear") {
      // Linear Identity Fetch (GraphQL)
      const gqlRes = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          query: `query { viewer { organization { id name } } }`
        }),
      });

      if (!gqlRes.ok) {
        console.error("Failed to fetch Linear identity", await gqlRes.text());
        return redirectWithError("Failed to fetch Linear identity", storedState.redirectPath);
      }

      const gqlData = await gqlRes.json();
      if (gqlData.errors) {
         console.error("Linear GraphQL errors", gqlData.errors);
         return redirectWithError("Linear API Error", storedState.redirectPath);
      }

      const org = gqlData.data?.viewer?.organization;
      if (!org?.id) {
        console.error("Invalid Linear identity response", gqlData);
        return redirectWithError("Invalid Linear identity", storedState.redirectPath);
      }

      providerAccountId = org.id;
      linearInfo = {
        workspace_id: org.id,
        workspace_name: org.name,
      };
    } else if (providerId === "google") {
      // Google Identity Fetch
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!userRes.ok) {
        console.error("Failed to fetch Google identity", await userRes.text());
        return redirectWithError("Failed to fetch Google identity", storedState.redirectPath);
      }

      const userData = await userRes.json();
      if (!userData.sub) {
        console.error("Invalid Google identity response", userData);
        return redirectWithError("Invalid Google identity", storedState.redirectPath);
      }

      providerAccountId = userData.sub;
      googleInfo = {
        google_user_id: userData.sub,
        email: userData.email,
      };
    }

    const tokenSet = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      scope: tokens.scope,
      provider_account_id: providerAccountId,
      updated_at: new Date().toISOString(),
      // Store GitHub specific fields
      github_user_id: githubUser?.id,
      github_username: githubUser?.login,
      // Store Slack specific fields
      slack_team_id: slackInfo?.team_id,
      slack_team_name: slackInfo?.team_name,
      slack_bot_user_id: slackInfo?.bot_user_id,
      // Store Notion specific fields
      notion_workspace_id: notionInfo?.workspace_id,
      notion_workspace_name: notionInfo?.workspace_name,
      notion_bot_id: notionInfo?.bot_id,
      notion_owner_user_id: notionInfo?.owner_user_id,
      // Store Linear specific fields
      linear_workspace_id: linearInfo?.workspace_id,
      linear_workspace_name: linearInfo?.workspace_name,
      // Store Google specific fields
      google_user_id: googleInfo?.google_user_id,
      google_email: googleInfo?.email,
    };

    const uiConfig = getIntegrationUIConfig(providerId);
    const requiredScopes = uiConfig.auth.type === "oauth" ? uiConfig.auth.scopes ?? [] : [];
    const grantedScopes = normalizeScopes(tokens.scope);
    const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
    const integrationStatus = missingScopes.length > 0 ? "missing_permissions" : "active";

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
          oauth_client_id: null,
          provider_account_id: providerAccountId,
          scopes: grantedScopes,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,integration_id" }
      );

    if (upsertError) {
      console.error("Failed to store tokens", upsertError);
      return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
    }

    await supabase.from("org_integrations").upsert(
      {
        org_id: storedState.orgId,
        integration_id: providerId,
        status: integrationStatus,
        scopes: grantedScopes,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,integration_id" }
    );

    await supabase.from("integration_audit_logs").insert({
      org_id: storedState.orgId,
      integration_id: providerId,
      event_type: "connection_succeeded",
      metadata: { scopes: grantedScopes, missing_scopes: missingScopes },
    });

    if (missingScopes.length > 0) {
      await supabase.from("integration_audit_logs").insert({
        org_id: storedState.orgId,
        integration_id: providerId,
        event_type: "missing_permissions",
        metadata: { scopes: grantedScopes, missing_scopes: missingScopes },
      });
    }

    // 4. Run Health Check & Persist Status
    // The user explicitly requested "Run a live test API call" and "Persist integration state: connected: true, healthy: true | false".
    // We already have identity info which proves connectivity, but let's run the formal health check to populate integration_health table.
    try {
        await testIntegrationConnection({ orgId: storedState.orgId, integrationId: providerId });
    } catch (healthErr) {
        console.warn("Health check failed during callback (non-fatal for auth)", healthErr);
        // We still consider it "active" because we got tokens, but health table will show error.
    }

    // 5. Trigger Schema Discovery
    try {
      console.log(`Triggering schema discovery for ${providerId} (Org: ${storedState.orgId})...`);
      // We pass the full token set so discoverers can use what they need (e.g. refresh tokens if implemented later)
      await fetchAndPersistSchemas(storedState.orgId, providerId, providerId, tokenSet); // Pass providerId as integrationId for now
      console.log("Schema discovery completed successfully.");
    } catch (discoveryErr) {
      console.error("Schema discovery failed during callback", discoveryErr);
      // Mark as failed in DB?
      // For Phase 14, we just log it. The UI will show "No schema" state.
      // Ideally update status to 'schema_failed'
      await supabase
        .from("integration_connections")
        .update({ status: "schema_failed" })
        .eq("org_id", storedState.orgId)
        .eq("integration_id", providerId);
      await supabase
        .from("org_integrations")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("org_id", storedState.orgId)
        .eq("integration_id", providerId);
      await supabase.from("integration_audit_logs").insert({
        org_id: storedState.orgId,
        integration_id: providerId,
        event_type: "schema_discovery_failed",
        metadata: { error: "Schema discovery failed" },
      });
        
      return redirectWithError("Schema discovery failed", storedState.redirectPath);
    }

    // 5. Redirect
    let redirectPath = storedState.redirectPath;

    // Resume Logic: If resumeId is present, try to load context to get the precise return path
    if (storedState.resumeId) {
      try {
        const resumeContext = await getResumeContext(storedState.resumeId);
        if (resumeContext) {
          redirectPath = resumeContext.returnPath;
          // Ensure resumeId is passed to the frontend
          const sep = redirectPath.includes("?") ? "&" : "?";
          if (!redirectPath.includes("resumeId=")) {
             redirectPath = `${redirectPath}${sep}resumeId=${storedState.resumeId}`;
          }
        }
      } catch (err) {
        console.error("Failed to load resume context in callback", err);
        // Fallback to storedState.redirectPath
      }
    }

    const successUrl = new URL(redirectPath, env.APP_BASE_URL);
    successUrl.searchParams.set("integration_connected", "true");
    return NextResponse.redirect(successUrl);

  } catch (err) {
    console.error("OAuth callback error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
