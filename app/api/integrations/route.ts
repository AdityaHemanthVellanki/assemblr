import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INTEGRATIONS_UI, getIntegrationUIConfig } from "@/lib/integrations/registry";
import { encryptJson } from "@/lib/security/encryption";
// import { testIntegrationConnection } from "@/lib/integrations/testIntegration";

export const dynamic = "force-dynamic";

export async function GET() {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireOrgMember>>["ctx"];
  try {
    ({ ctx } = await requireOrgMember());
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { listConnections } = await import("@/lib/integrations/composio/connection");
  const { getIntegrationConfig } = await import("@/lib/integrations/composio/config");

  // 1. Fetch live connections from Composio
  const liveConnections = await listConnections(ctx.orgId);

  // 2. Fetch metadata from local DB
  const supabase = await createSupabaseServerClient();
  const { data: dbConnections } = await (supabase
    .from("integration_connections")
    .select("composio_connection_id, label, user_id, updated_at")
    .eq("org_id", ctx.orgId) as any);

  const dbMap = new Map((dbConnections as any[])?.map((c: any) => [c.composio_connection_id, c]) || []);

  console.log(`[API] Listing for Org: ${ctx.orgId}. Found ${liveConnections.length} live connections.`);

  // 3. Map connections to integrations
  const integrations = INTEGRATIONS_UI.map(config => {
    // Find all live connections for this integration
    const conns = liveConnections.filter(c => c.integrationId === config.id);

    // Pick the most recent one as the authoritative connection
    const primaryConn = conns.sort((a, b) =>
      new Date(b.connectedAt).getTime() - new Date(a.connectedAt).getTime()
    )[0];

    const meta = primaryConn ? dbMap.get(primaryConn.id) as any : null;
    const identity = primaryConn ? (primaryConn.label || meta?.label || primaryConn.metadata?.userName || primaryConn.metadata?.userEmail || `Account ${primaryConn.id.slice(-4)}`) : null;

    return {
      ...config,
      connected: !!primaryConn,
      connectedAt: primaryConn?.connectedAt || null,
      status: primaryConn?.status.toLowerCase() || "not_connected",
      connectionId: primaryConn?.id || null,
      label: identity,
      userId: meta?.user_id || null,
      updatedAt: meta?.updated_at || primaryConn?.connectedAt || null,
      requiredParams: getIntegrationConfig(config.id).requiredParams,
    };
  });

  return NextResponse.json({ integrations });
}

export async function POST(req: Request) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("editor"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json();
  const { integrationId, credentials } = body;

  if (!integrationId) {
    return NextResponse.json({ error: "Missing integrationId" }, { status: 400 });
  }

  let ui;
  try {
    ui = getIntegrationUIConfig(integrationId);
  } catch (e) {
    return NextResponse.json({ error: "Invalid integrationId" }, { status: 400 });
  }

  const { getComposioClient } = await import("@/lib/integrations/composio/client");
  const client = getComposioClient();

  try {
    if (ui.auth.type !== "oauth" && credentials) {
      // Handle API Key or other non-OAuth credentials via Composio
      // @ts-ignore - SDK types might be outdated but API accepts these for UI branding
      const connectionRequest = await client.connectedAccounts.initiate({
        entityId: ctx.orgId,
        integrationId,
        connectionParams: credentials, // Pass credentials to Composio
        authMode: ui.auth.type === "api_key" ? "API_KEY" : "BASIC", // Simplified mapping
        displayName: "Assemblr",
        appLogo: `${process.env.NEXT_PUBLIC_APP_URL}/images/logo-full.png`,
      } as any);

      if (connectionRequest.connectionStatus === "FAILED") {
        return NextResponse.json({ error: "Connection failed" }, { status: 400 });
      }
    } else if (ui.auth.type === "oauth") {
      // OAuth is handled via the separate redirect flow
      return NextResponse.json({ ok: true });
    }

    const supabase = await createSupabaseServerClient();
    await supabase.from("integration_audit_logs").insert({
      org_id: ctx.orgId,
      integration_id: integrationId,
      event_type: "connection_succeeded",
      metadata: { provider: "composio", mode: ui.auth.type },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Failed to connect via Composio", e);
    return NextResponse.json({ error: e.message || "Connection failed" }, { status: 500 });
  }
}
