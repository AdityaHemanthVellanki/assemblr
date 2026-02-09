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
  const connections = await listConnections(ctx.orgId);

  console.log(`[API] Listing for Org: ${ctx.orgId}. Found ${connections.length} connections.`);

  const connectedMap = new Map<string, any>();
  const STATUS_PRIORITY: Record<string, number> = {
    "ACTIVE": 10,
    "CONNECTED": 9,
    "INITIATED": 5,
    "EXPIRED": 1,
    "FAILED": 0
  };

  for (const conn of connections) {
    const existing = connectedMap.get(conn.integrationId);
    const existingScore = existing ? (STATUS_PRIORITY[existing.status] || 0) : -1;
    const newScore = STATUS_PRIORITY[conn.status] || 0;

    if (newScore > existingScore) {
      connectedMap.set(conn.integrationId, conn);
    }
  }

  const integrations = INTEGRATIONS_UI.map((i) => {
    const conn = connectedMap.get(i.id);
    const isConnected = conn && (conn.status === "ACTIVE" || conn.status === "CONNECTED");

    return {
      id: i.id,
      name: i.name,
      category: i.category,
      logoUrl: i.logoUrl,
      description: i.description,
      connectionMode: i.connectionMode,
      auth: i.auth,
      connected: !!conn,
      status: conn ? conn.status.toLowerCase() : "not_connected",
      connectedAt: conn?.connectedAt ?? null,
      updatedAt: conn?.connectedAt ?? null, // Composio doesn't strictly provide updatedAt in this list
      scopes: [], // Composio handles scopes internally
      requiredParams: getIntegrationConfig(i.id).requiredParams,
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
