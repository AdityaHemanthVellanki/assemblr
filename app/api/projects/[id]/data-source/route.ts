import { NextResponse } from "next/server";
import { z } from "zod";

import {
  PermissionError,
  requireRole,
} from "@/lib/auth/permissions.server";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    dataSourceId: z.string().min(1).nullable(),
  })
  .strict();

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("owner"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const projectRes = await supabase
    .from("projects")
    .select("id")
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
  if (!projectRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataSourceId = parsed.data.dataSourceId;
  if (dataSourceId) {
    const dsRes = await supabase
      .from("data_sources")
      .select("id")
      .eq("id", dataSourceId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();
    if (dsRes.error) {
      console.error("validate data source failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        projectId: id,
        dataSourceId,
        message: dsRes.error.message,
      });
      return NextResponse.json({ error: "Failed to validate data source" }, { status: 500 });
    }
    if (!dsRes.data) {
      return NextResponse.json({ error: "Invalid data source" }, { status: 400 });
    }
  }

  const updatedRes = await supabase
    .from("projects")
    .update({ data_source_id: dataSourceId })
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .select("id, name, data_source_id")
    .maybeSingle();
  if (updatedRes.error) {
    console.error("update project data source failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      projectId: id,
      message: updatedRes.error.message,
    });
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
  if (!updatedRes.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    project: {
      id: updatedRes.data.id as string,
      name: updatedRes.data.name as string,
      dataSourceId: (updatedRes.data.data_source_id as string | null) ?? null,
    },
  });
}
