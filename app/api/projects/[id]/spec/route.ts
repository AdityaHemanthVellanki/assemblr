import { NextResponse } from "next/server";
import { z } from "zod";

import {
  PermissionError,
  requireRole,
} from "@/lib/auth/permissions.server";
import { parseToolSpec } from "@/lib/spec/toolSpec";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    spec: z.unknown(),
  })
  .strict();

export async function PATCH(
  req: Request,
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

  const json = await req.json().catch(() => null);
  const bodyResult = bodySchema.safeParse(json);
  if (!bodyResult.success) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const { id } = await params;

  const supabase = await createSupabaseServerClient();

  try {
    const incoming = bodyResult.data.spec;
    const spec = isToolSystemSpec(incoming) ? incoming : parseToolSpec(incoming);

    const updatedRes = await supabase
      .from("projects")
      .update({ spec: spec as any })
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .select("id, name, spec, created_at, updated_at")
      .maybeSingle();

    if (updatedRes.error) {
      console.error("update-spec failed", {
        userId: ctx.userId,
        orgId: ctx.orgId,
        projectId: id,
        message: updatedRes.error.message,
      });
      return NextResponse.json({ error: "Failed to save spec" }, { status: 500 });
    }
    if (!updatedRes.data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      project: {
        id: updatedRes.data.id as string,
        name: updatedRes.data.name as string,
        spec: updatedRes.data.spec,
        createdAt: new Date(updatedRes.data.created_at as string),
        updatedAt: new Date(updatedRes.data.updated_at as string),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("update-spec failed", {
      userId: ctx.userId,
      orgId: ctx.orgId,
      projectId: id,
      message,
    });

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Spec failed validation" },
        { status: 422 },
      );
    }

    return NextResponse.json({ error: "Failed to save spec" }, { status: 500 });
  }
}
