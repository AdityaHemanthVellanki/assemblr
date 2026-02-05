import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INTEGRATIONS_UI, getIntegrationUIConfig } from "@/lib/integrations/registry";
import { encryptJson } from "@/lib/security/encryption";
import { testIntegrationConnection } from "@/lib/integrations/testIntegration";

export const dynamic = "force-dynamic";

function normalizeScopes(scopes: string[] | string | null | undefined) {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.filter(Boolean);
  return scopes
    .split(/[ ,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

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

  const supabase = await createSupabaseServerClient();
  const [connectionsRes, orgIntegrationsRes, healthRes] = await Promise.all([
    supabase
      .from("integration_connections")
      .select("integration_id, created_at, updated_at, status, scopes, connected_at")
      .eq("org_id", ctx.orgId),
    supabase
      .from("org_integrations")
      .select("integration_id, status, scopes, connected_at, updated_at")
      .eq("org_id", ctx.orgId),
    supabase
      .from("integration_health")
      .select("integration_id, status, error_message, last_checked_at")
      .eq("org_id", ctx.orgId),
  ]);

  if (connectionsRes.error) {
    console.error("list integration connections failed", {
      orgId: ctx.orgId,
      message: connectionsRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 });
  }

  const connectedById = new Map<
    string,
    { createdAt: string; updatedAt: string; status: string; scopes: string[]; connectedAt: string | null }
  >();
  if (!connectionsRes.data) {
    throw new Error("Failed to load integrations");
  }
  for (const row of connectionsRes.data) {
    connectedById.set(row.integration_id as string, {
      createdAt: row.created_at as string,
      updatedAt: (row.updated_at || row.created_at) as string,
      status: (row.status as string) || "active",
      scopes: normalizeScopes((row as any).scopes ?? []),
      connectedAt: (row as any).connected_at ?? (row.created_at as string),
    });
  }

  const orgIntegrationsById = new Map<
    string,
    { status: string; scopes: string[]; connectedAt: string | null; updatedAt: string | null }
  >();
  for (const row of orgIntegrationsRes.data ?? []) {
    orgIntegrationsById.set(row.integration_id as string, {
      status: (row.status as string) || "active",
      scopes: normalizeScopes((row as any).scopes ?? []),
      connectedAt: (row as any).connected_at ?? null,
      updatedAt: (row as any).updated_at ?? null,
    });
  }

  const healthById = new Map<
    string,
    { status: string; errorMessage: string | null; lastCheckedAt: string | null }
  >();
  for (const row of healthRes.data ?? []) {
    healthById.set(row.integration_id as string, {
      status: row.status as string,
      errorMessage: (row as any).error_message ?? null,
      lastCheckedAt: (row as any).last_checked_at ?? null,
    });
  }

  const integrations = INTEGRATIONS_UI.map((i) => {
    const conn = connectedById.get(i.id);
    const orgIntegration = orgIntegrationsById.get(i.id);
    const health = healthById.get(i.id);
    const requiredScopes =
      i.auth.type === "oauth" ? (i.auth.scopes ?? []) : [];
    const grantedScopes = orgIntegration?.scopes ?? conn?.scopes ?? [];
    const missingScopes = requiredScopes.filter((s) => !grantedScopes.includes(s));
    const statusFromOrg = orgIntegration?.status;
    const connectionStatus = conn?.status;
    const isPending = connectionStatus === "pending" || connectionStatus === "pending_setup" || statusFromOrg === "pending";
    const isError = connectionStatus === "error" || connectionStatus === "reauth_required" || statusFromOrg === "error" || health?.status === "error";
    // Use dynamically computed missingScopes, not stale DB status
    // This ensures reconnecting with correct scopes properly updates displayed status
    const isMissingPermissions = missingScopes.length > 0;
    const isActive = connectionStatus === "active" || statusFromOrg === "active";
    const isRevoked = statusFromOrg === "revoked";
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      logoUrl: i.logoUrl,
      description: i.description,
      connectionMode: i.connectionMode,
      auth: i.auth,
      connected: Boolean(conn) && !isPending && !isRevoked,
      status: isRevoked
        ? "not_connected"
        : isMissingPermissions
          ? "missing_permissions"
          : isError
            ? "error"
            : isPending
              ? "pending"
              : isActive
                ? "active"
                : "not_connected",
      connectedAt: orgIntegration?.connectedAt ?? conn?.connectedAt ?? null,
      updatedAt: orgIntegration?.updatedAt ?? conn?.updatedAt ?? null,
      scopes: grantedScopes,
      missingScopes,
      health: health ?? null,
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

  let encrypted = null;
  // Encrypt if not OAuth and credentials provided
  if (ui.auth.type !== "oauth" && credentials) {
    try {
      encrypted = encryptJson(credentials);
    } catch (e) {
      console.error("Encryption failed", e);
      return NextResponse.json({ error: "Encryption failed" }, { status: 500 });
    }
  }

  const supabase = await createSupabaseServerClient();

  // Upsert connection
  const { error: upsertError } = await supabase.from("integration_connections").upsert({
    org_id: ctx.orgId,
    integration_id: integrationId,
    encrypted_credentials: encrypted ? JSON.stringify(encrypted) : null,
    ...(ui.auth.type !== "oauth" ? { encrypted_credentials: encrypted ? JSON.stringify(encrypted) : null } : {}),
    status: "pending",
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id, integration_id" });

  if (upsertError) {
    console.error("Failed to upsert connection", upsertError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  await supabase.from("org_integrations").upsert({
    org_id: ctx.orgId,
    integration_id: integrationId,
    status: ui.auth.type === "oauth" ? "pending" : "active",
    scopes: [],
    connected_at: ui.auth.type === "oauth" ? null : new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id, integration_id" });

  await supabase.from("integration_audit_logs").insert({
    org_id: ctx.orgId,
    integration_id: integrationId,
    event_type: "connection_started",
    metadata: { connection_mode: ui.auth.type },
  });

  // Test Connection (skip for OAuth start)
  if (ui.auth.type !== "oauth") {
    const test = await testIntegrationConnection({ orgId: ctx.orgId, integrationId });
    if (test.status === "error") {
      // Revert status to error
      await supabase.from("integration_connections").update({
        status: "error"
      }).eq("org_id", ctx.orgId).eq("integration_id", integrationId);

      await supabase.from("org_integrations").update({
        status: "error",
        updated_at: new Date().toISOString(),
      }).eq("org_id", ctx.orgId).eq("integration_id", integrationId);

      await supabase.from("integration_audit_logs").insert({
        org_id: ctx.orgId,
        integration_id: integrationId,
        event_type: "connection_failed",
        metadata: { error: test.error?.message ?? "Connection failed" },
      });

      return NextResponse.json({ error: test.error?.message || "Connection failed" }, { status: 400 });
    } else {
      // Success
      await supabase.from("integration_connections").update({
        status: "active"
      }).eq("org_id", ctx.orgId).eq("integration_id", integrationId);

      await supabase.from("org_integrations").update({
        status: "active",
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("org_id", ctx.orgId).eq("integration_id", integrationId);

      await supabase.from("integration_audit_logs").insert({
        org_id: ctx.orgId,
        integration_id: integrationId,
        event_type: "connection_succeeded",
        metadata: {},
      });
    }
  }

  return NextResponse.json({ ok: true });
}
