import { NextResponse } from "next/server";

import { PermissionError, requireRole } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: integrationId } = await params;
  if (!integrationId?.trim()) {
    return NextResponse.json({ error: "Invalid integration" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("org_integrations")
    .update({
      status: "revoked",
      connected_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", ctx.orgId)
    .eq("integration_id", integrationId);

  await supabase.from("integration_audit_logs").insert({
    org_id: ctx.orgId,
    integration_id: integrationId,
    event_type: "revoked",
    metadata: {},
  });

  const delRes = await supabase
    .from("integration_connections")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("integration_id", integrationId);

  if (delRes.error) {
    console.error("delete integration connection failed", {
      orgId: ctx.orgId,
      integrationId,
      message: delRes.error.message,
    });
    return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
