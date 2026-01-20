import { NextResponse } from "next/server";

import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; runId: string }> },
) {
  const { toolId, runId } = await params;
  const { ctx } = await requireOrgMember();
  await requireProjectOrgAccess(ctx, toolId);
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("execution_runs")
    .select("*")
    .eq("id", runId)
    .eq("tool_id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run: data });
}
