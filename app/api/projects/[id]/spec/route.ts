import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "@/lib/auth/auth-options";
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

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = session.user.orgId;
  if (!orgId) {
    return NextResponse.json({ error: "User missing orgId" }, { status: 403 });
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
    where: { id, orgId },
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
      userId: session.user.id,
      orgId,
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
