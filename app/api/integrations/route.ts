import { NextResponse } from "next/server";
import { z } from "zod";

import { PermissionError, requireOrgMember, requireRole } from "@/lib/auth/permissions";
import { getServerEnv } from "@/lib/env";
import { encryptJson } from "@/lib/security/encryption";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getConnector, getIntegrationUIConfig, INTEGRATIONS_UI } from "@/lib/integrations/registry";

const connectSchema = z
  .object({
    integrationId: z.string().min(1),
    credentials: z.record(z.string(), z.unknown()),
  })
  .strict();

function buildConnectorCredentials(input: {
  integrationId: string;
  credentials: Record<string, unknown>;
}): Record<string, string> {
  const { integrationId, credentials } = input;
  const ui = getIntegrationUIConfig(integrationId);

  if (ui.auth.type === "none") return {};

  if (ui.auth.type === "api_key" || ui.auth.type === "oauth") {
    const out: Record<string, string> = {};
    const fields = ui.auth.fields || [];
    for (const f of fields) {
      if (f.kind !== "string") continue;
      const raw = credentials[f.id];
      const value = typeof raw === "string" ? raw : "";
      if ((f.required ?? false) && !value.trim()) {
        throw new Error(`Missing required field: ${f.label}`);
      }
      if (value.trim()) out[f.id] = value;
    }
    return out;
  }

  if (ui.auth.type === "database") {
    const host = typeof credentials.host === "string" ? credentials.host : "";
    const database = typeof credentials.database === "string" ? credentials.database : "";
    const username = typeof credentials.username === "string" ? credentials.username : "";
    const password = typeof credentials.password === "string" ? credentials.password : "";
    const ssl = Boolean(credentials.ssl);

    const portRaw = credentials.port;
    const port =
      typeof portRaw === "number"
        ? portRaw
        : typeof portRaw === "string" && portRaw.trim()
          ? Number(portRaw)
          : NaN;

    if (!host.trim() || !database.trim() || !username.trim() || !password.trim()) {
      throw new Error("Invalid credentials");
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("Invalid credentials");
    }

    const u = encodeURIComponent(username);
    const p = encodeURIComponent(password);
    const h = host.trim();
    const d = encodeURIComponent(database.trim());
    const qs = ssl ? "?sslmode=require" : "";

    return { connectionString: `postgresql://${u}:${p}@${h}:${port}/${d}${qs}` };
  }

  throw new Error("Unsupported auth type");
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
  const connectionsRes = await supabase
    .from("integration_connections")
    .select("integration_id, created_at, status")
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
      updatedAt: row.created_at as string,
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
      auth: i.auth,
      connected: Boolean(conn && conn.status === "active"),
      connectedAt: conn?.createdAt ?? null,
      updatedAt: conn?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ integrations });
}

export async function POST(req: Request) {
  const env = getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("editor"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const rl = checkRateLimit({
    key: `integrations-connect:${ctx.orgId}`,
    windowMs: 60_000,
    max: 20,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  if (!env.DATA_ENCRYPTION_KEY) {
    return NextResponse.json({ error: "Encryption is not configured" }, { status: 500 });
  }

  const json = await req.json().catch(() => null);
  const parsed = connectSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { integrationId, credentials } = parsed.data;
  let ui;
  try {
    ui = getIntegrationUIConfig(integrationId);
  } catch {
    return NextResponse.json({ error: "Invalid integration" }, { status: 400 });
  }

  let connectorCredentials: Record<string, string>;
  try {
    connectorCredentials = buildConnectorCredentials({
      integrationId,
      credentials: credentials as Record<string, unknown>,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message || "Invalid credentials" }, { status: 400 });
  }

  // Only perform connector check if NOT OAuth
  if (ui.auth.type !== "oauth") {
    try {
      const connector = getConnector(integrationId);
      const connectRes = await connector.connect({
        orgId: ctx.orgId,
        credentials: connectorCredentials,
      });

      if (!connectRes.success) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("integration connect failed", { orgId: ctx.orgId, integrationId, message });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    const supabase = createSupabaseAdminClient();
    const encrypted = encryptJson(connectorCredentials);
    
    // Determine initial status
    const status = ui.auth.type === "oauth" ? "pending_setup" : "active";

    const { error: upsertError } = await supabase
      .from("integration_connections")
      .upsert({
        org_id: ctx.orgId,
        integration_id: integrationId,
        encrypted_credentials: JSON.stringify(encrypted),
        status,
      }, { onConflict: 'org_id,integration_id' });

    if (upsertError) {
       console.error("write integration connection failed", {
        orgId: ctx.orgId,
        integrationId,
        message: upsertError.message,
      });
      return NextResponse.json(
        { error: "Failed to save credentials" },
        { status: 500 },
      );
    }
    
    // Fetch back the row to return details
    const { data: row } = await supabase
        .from("integration_connections")
        .select("integration_id, created_at")
        .eq("org_id", ctx.orgId)
        .eq("integration_id", integrationId)
        .single();

    return NextResponse.json({
      integration: {
        id: row?.integration_id as string,
        connected: status === "active",
        connectedAt: row?.created_at as string,
        updatedAt: row?.created_at as string,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("integration save failed", { orgId: ctx.orgId, integrationId, message });
    return NextResponse.json({ error: "Failed to save integration" }, { status: 500 });
  }
}
