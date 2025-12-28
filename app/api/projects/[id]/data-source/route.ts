import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canManageDataSources,
  getSessionContext,
  type OrgRole,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

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

  if (!canManageDataSources(role)) {
    return NextResponse.json({ error: "Only owners can manage data sources" }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, orgId: ctx.orgId },
    select: { id: true },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataSourceId = parsed.data.dataSourceId;
  if (dataSourceId) {
    const ds = await prisma.dataSource.findFirst({
      where: { id: dataSourceId, orgId: ctx.orgId },
      select: { id: true },
    });
    if (!ds) {
      return NextResponse.json({ error: "Invalid data source" }, { status: 400 });
    }
  }

  const updated = await prisma.project.update({
    where: { id },
    data: { dataSourceId },
    select: { id: true, name: true, dataSourceId: true },
  });

  return NextResponse.json({ project: updated });
}
