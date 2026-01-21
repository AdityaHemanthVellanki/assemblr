import { NextResponse } from "next/server";

import { requireRole, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { promoteToolVersion } from "@/lib/toolos/versioning";
import { handleApiError } from "@/lib/api/response";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string; versionId: string }> },
) {
  try {
    const { toolId, versionId } = await params;
    const { ctx } = await requireRole("editor");
    await requireProjectOrgAccess(ctx, toolId);
    const supabase = await createSupabaseServerClient();

    const { data: version, error } = await (supabase.from("tool_versions") as any)
      .select("id, tool_id, org_id")
      .eq("id", versionId)
      .eq("tool_id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    await promoteToolVersion({ toolId, versionId });

    return NextResponse.json({ status: "ok" });
  } catch (e) {
    return handleApiError(e);
  }
}
