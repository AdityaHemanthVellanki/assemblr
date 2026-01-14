import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember } from "@/lib/auth/permissions.server";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { INTEGRATIONS_UI } from "@/lib/integrations/registry";

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
      connectionMode: i.connectionMode,
      auth: i.auth,
      connected: Boolean(conn && conn.status === "active"),
      connectedAt: conn?.createdAt ?? null,
      updatedAt: conn?.updatedAt ?? null,
    };
  });

  return NextResponse.json({ integrations });
}
