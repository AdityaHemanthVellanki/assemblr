import { NextResponse } from "next/server";

import { getSessionContext, PermissionError, requireUserRole } from "@/lib/auth/permissions";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  let ctx: Awaited<ReturnType<typeof getSessionContext>>;
  try {
    ctx = await getSessionContext();
    await requireUserRole(ctx);
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, orgId: ctx.orgId },
    select: {
      id: true,
      name: true,
      spec: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const spec = parseDashboardSpec(project.spec);

  return NextResponse.json({
    project: {
      ...project,
      spec,
    },
  });
}
