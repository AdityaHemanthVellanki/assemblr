import { NextResponse } from "next/server";

import { canEditProjects, getSessionContext, PermissionError, requireUserRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";
import { createDefaultDashboardSpec } from "@/lib/dashboard/spec";

export async function GET() {
  getServerEnv();

  try {
    const ctx = await getSessionContext();
    await requireUserRole(ctx);

    const projects = await prisma.project.findMany({
      where: { orgId: ctx.orgId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ projects });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  getServerEnv();

  try {
    const ctx = await getSessionContext();
    const { role } = await requireUserRole(ctx);
    if (!canEditProjects(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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
        orgId: ctx.orgId,
        spec,
      },
      select: { id: true },
    });

    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
