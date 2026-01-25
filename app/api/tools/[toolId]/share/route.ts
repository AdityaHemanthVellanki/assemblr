import { NextResponse } from "next/server";
import crypto from "crypto";

import { PermissionError, requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  getServerEnv();
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    await requireProjectOrgAccess(ctx, toolId);

    const body = (await req.json().catch(() => null)) as
      | { scope?: "all" | "version"; versionId?: string | null }
      | null;
    const scope = body?.scope === "version" ? "version" : "all";
    const versionId = scope === "version" ? body?.versionId ?? null : null;

    const token = crypto.randomUUID().replace(/-/g, "");
    const supabase = createSupabaseAdminClient();
    const { error } = await (supabase.from("tool_shares") as any).insert({
      token,
      tool_id: toolId,
      org_id: ctx.orgId,
      created_by: ctx.userId,
      scope,
      version_id: versionId,
    });
    if (error) {
      return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
    }
    const origin = new URL(req.url).origin;
    return NextResponse.json({ url: `${origin}/share/${token}` });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
