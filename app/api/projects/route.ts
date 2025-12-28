import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";
import { createDefaultDashboardSpec } from "@/lib/dashboard/spec";

export async function GET() {
  getServerEnv();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "User missing orgId" }, { status: 403 });
  }

  const projects = await prisma.project.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  getServerEnv();

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "User missing orgId" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as unknown;
  const maybeName =
    body && typeof body === "object" && "name" in body
      ? (body as { name?: unknown }).name
      : undefined;
  const name =
    typeof maybeName === "string" && maybeName.trim().length > 0
      ? maybeName.trim()
      : "Untitled Project";

  const spec = createDefaultDashboardSpec({ title: name });

  const project = await prisma.project.create({
    data: {
      name,
      orgId,
      spec,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: project.id }, { status: 201 });
}
