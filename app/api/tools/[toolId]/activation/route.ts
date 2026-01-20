import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrgMember, requireProjectOrgAccess, requireRole } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";

const bodySchema = z.object({
  activated: z.boolean(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  await requireProjectOrgAccess(ctx, toolId);
  const supabase = await createSupabaseServerClient();
  const { data: project } = await (supabase.from("projects") as any)
    .select("is_activated")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }

  return NextResponse.json({ activated: project.is_activated === true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireRole("editor");
  await requireProjectOrgAccess(ctx, toolId);
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  if (parsed.data.activated) {
    const { data: project } = await (supabase.from("projects") as any)
      .select("active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();
    if (!project?.active_version_id) {
      return NextResponse.json(
        {
          status: "blocked",
          reason: "Tool not compiled yet",
          action: "Finish compilation before activating",
        },
        { status: 409 },
      );
    }
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("compiled_tool")
      .eq("id", project.active_version_id)
      .single();
    if (!isCompiledToolArtifact(version?.compiled_tool)) {
      return NextResponse.json(
        {
          status: "blocked",
          reason: "CompiledTool missing for active version",
          action: "Recompile the tool to generate a CompiledTool artifact",
        },
        { status: 409 },
      );
    }
  }

  const { error } = await (supabase.from("projects") as any)
    .update({ is_activated: parsed.data.activated })
    .eq("id", toolId)
    .eq("org_id", ctx.orgId);

  if (error) {
    return NextResponse.json({ error: "Failed to update activation state" }, { status: 500 });
  }

  return NextResponse.json({ activated: parsed.data.activated });
}
