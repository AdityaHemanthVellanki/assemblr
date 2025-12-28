import { NextResponse } from "next/server";

import {
  getSessionContext,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";

export async function GET() {
  getServerEnv();

  try {
    const ctx = await getSessionContext();
    const { role } = await requireUserRole(ctx);

    const members = await prisma.membership.findMany({
      where: { orgId: ctx.orgId },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      me: { userId: ctx.userId, role },
      members: members.map((m) => ({
        userId: m.userId,
        role: m.role,
        createdAt: m.createdAt,
        email: m.user.email,
        name: m.user.name,
      })),
    });
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

