import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canEditProjects,
  getSessionContext,
  type OrgRole,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

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

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  let role: OrgRole;
  try {
    ctx = await getSessionContext();
    ({ role } = await requireUserRole(ctx));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  if (!canEditProjects(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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

  const project = await prisma.project.findFirst({
    where: { id, orgId: ctx.orgId },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const spec = parseDashboardSpec(bodyResult.data.spec);

    const updated = await prisma.project.update({
      where: { id },
      data: { spec },
      select: {
        id: true,
        name: true,
        spec: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ project: updated });
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
