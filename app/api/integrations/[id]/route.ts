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

  try {
    const { removeConnection } = await import("@/lib/integrations/composio/connection");
    await removeConnection(ctx.orgId, integrationId);

    const supabase = await createSupabaseServerClient();
    await supabase.from("integration_audit_logs").insert({
      org_id: ctx.orgId,
      integration_id: integrationId,
      event_type: "revoked",
      metadata: { provider: "composio" },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("delete integration connection failed", {
      orgId: ctx.orgId,
      integrationId,
      message: e.message,
    });
    return NextResponse.json({ error: "Failed to disconnect integration" }, { status: 500 });
  }
}
