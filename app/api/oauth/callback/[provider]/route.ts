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

  let storedState: { state: string; orgId: string; providerId: string; redirectPath: string };
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
  
  const clientId = process.env[idKey] || "";
  const clientSecret = process.env[secretKey] || "";

  if (!clientId || !clientSecret) {
    console.error(`Missing hosted credentials for ${providerId} (expected env: ${idKey}, ${secretKey})`);
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
          provider_account_id: providerAccountId,
        },
        { onConflict: "org_id,integration_id" }
      );

    if (upsertError) {
      console.error("Failed to store tokens", upsertError);
      return NextResponse.json({ error: "Failed to save connection" }, { status: 500 });
    }

    // 4. Redirect
    const successUrl = new URL(storedState.redirectPath, env.APP_BASE_URL);
    successUrl.searchParams.set("integration_connected", "true");
    return NextResponse.redirect(successUrl);

  } catch (err) {
    console.error("OAuth callback error", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
