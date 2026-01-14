import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember } from "@/lib/auth/permissions.server";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const projectRes = await supabase
    .from("projects")
    .select("id, name, spec, created_at, updated_at")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (projectRes.error) {
    console.error("load project failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      projectId: id,
      message: projectRes.error.message,
    });
    return NextResponse.json({ error: "Failed to load project" }, { status: 500 });
  }

  if (!projectRes.data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const spec = parseDashboardSpec(projectRes.data.spec);

  return NextResponse.json({
    project: {
      id: projectRes.data.id as string,
      name: projectRes.data.name as string,
      createdAt: new Date(projectRes.data.created_at as string),
      updatedAt: new Date(projectRes.data.updated_at as string),
      spec,
    },
  });
}
