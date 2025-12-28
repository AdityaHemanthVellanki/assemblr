import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "@/lib/auth/auth-options";
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

  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.user.orgId;
  if (!orgId) return NextResponse.json({ error: "User missing orgId" }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, orgId },
    select: { id: true },
  });

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dataSourceId = parsed.data.dataSourceId;
  if (dataSourceId) {
    const ds = await prisma.dataSource.findFirst({
      where: { id: dataSourceId, orgId },
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

