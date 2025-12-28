import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { parseDashboardSpec } from "@/lib/dashboard/spec";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  getServerEnv();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "User missing orgId" }, { status: 403 });
  }

  const { id } = await params;

  const project = await prisma.project.findFirst({
    where: { id, orgId },
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
