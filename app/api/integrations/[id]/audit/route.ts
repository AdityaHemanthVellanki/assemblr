import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: integrationId } = await params;
  if (!integrationId?.trim()) {
    return NextResponse.json({ error: "Invalid integration" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("integration_audit_logs")
    .select("id, integration_id, event_type, metadata, created_at")
    .eq("org_id", ctx.orgId)
    .eq("integration_id", integrationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("list integration audit logs failed", {
      orgId: ctx.orgId,
      integrationId,
      message: error.message,
    });
    return NextResponse.json({ error: "Failed to load audit logs" }, { status: 500 });
  }

  return NextResponse.json({ logs: data ?? [] });
}
