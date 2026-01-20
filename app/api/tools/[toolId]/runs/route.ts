import { NextResponse } from "next/server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("execution_runs")
    .select("id, status, current_step, retries, created_at, updated_at")
    .eq("tool_id", toolId)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Failed to load runs" }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}
