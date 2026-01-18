import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/auth/permissions.server";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INTEGRATIONS_UI, getIntegrationUIConfig } from "@/lib/integrations/registry";
import { encryptJson } from "@/lib/security/encryption";
import { testIntegrationConnection } from "@/lib/integrations/testIntegration";

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
  const connectionsRes = await supabase
    .from("integration_connections")
    .select("integration_id, created_at, updated_at, status")
    .eq("org_id", ctx.orgId);

  if (connectionsRes.error) {
    console.error("list integration connections failed", {
      orgId: ctx.orgId,
      message: connectionsRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load integrations" }, { status: 500 });
  }

  const connectedById = new Map<
    string,
    { createdAt: string; updatedAt: string; status: string }
  >();
  if (!connectionsRes.data) {
    throw new Error("Failed to load integrations");
  }
  for (const row of connectionsRes.data) {
    connectedById.set(row.integration_id as string, {
      createdAt: row.created_at as string,
      updatedAt: (row.updated_at || row.created_at) as string,
      status: (row.status as string) || "active",
    });
  }

  const integrations = INTEGRATIONS_UI.map((i) => {
    const conn = connectedById.get(i.id);
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      logoUrl: i.logoUrl,
      description: i.description,
      connectionMode: i.connectionMode,
      auth: i.auth,
      connected: Boolean(conn), // It is connected if a record exists
      status: conn?.status ?? "not_connected", // Explicit status
      connectedAt: conn?.createdAt ?? null,
      updatedAt: conn?.updatedAt ?? null,
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
    // For OAuth, we might be overwriting an existing valid token with null if we blindly update?
    // But this POST is called on "Connect".
    // If it's OAuth, credentials is empty. 
    // If we set encrypted_credentials to null, we lose the token?
    // YES.
    // If connectionMode is OAuth, we should probably NOT touch encrypted_credentials here.
    // Unless we are explicitly resetting?
    // But page.tsx calls this BEFORE redirect.
    // So we should ONLY update encrypted_credentials if it's NOT OAuth.
    // OR if it's OAuth, we skip updating that column.
    ...(ui.auth.type !== "oauth" ? { encrypted_credentials: encrypted ? JSON.stringify(encrypted) : null } : {}),
    status: "connecting", // Set to connecting initially
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id, integration_id" });

  if (upsertError) {
    console.error("Failed to upsert connection", upsertError);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  // Test Connection (skip for OAuth start)
  if (ui.auth.type !== "oauth") {
    const test = await testIntegrationConnection({ orgId: ctx.orgId, integrationId });
    if (test.status === "error") {
      // Revert status to error
       await supabase.from("integration_connections").update({ 
           status: "error" 
       }).eq("org_id", ctx.orgId).eq("integration_id", integrationId);

       return NextResponse.json({ error: test.error?.message || "Connection failed" }, { status: 400 });
    } else {
        // Success
       await supabase.from("integration_connections").update({ 
           status: "active" 
       }).eq("org_id", ctx.orgId).eq("integration_id", integrationId);
    }
  }

  return NextResponse.json({ ok: true });
}
