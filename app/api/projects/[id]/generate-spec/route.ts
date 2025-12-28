import { NextResponse } from "next/server";
import { z } from "zod";

import {
  canGenerateSpec,
  getSessionContext,
  type OrgRole,
  PermissionError,
  requireUserRole,
} from "@/lib/auth/permissions";
import { generateDashboardSpec } from "@/lib/ai/generateDashboardSpec";
import { prisma } from "@/lib/db/prisma";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/security/rate-limit";

const bodySchema = z
  .object({
    prompt: z.string().min(1).max(800),
  })
  .strict();

export async function POST(
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

  if (!canGenerateSpec(role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const userId = ctx.userId;
  const limit = checkRateLimit({
    key: `generate-spec:${userId}`,
    windowMs: 60_000,
    max: 5,
  });

  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "AI is not configured" },
      { status: 500 },
    );
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
    const spec = await generateDashboardSpec({
      prompt: bodyResult.data.prompt,
    });

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
    console.error("generate-spec failed", {
      userId,
      orgId: ctx.orgId,
      projectId: id,
      message,
    });

    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "AI returned an invalid dashboard spec" },
        { status: 422 },
      );
    }

    if (message === "AI returned invalid JSON") {
      return NextResponse.json({ error: message }, { status: 502 });
    }

    return NextResponse.json(
      { error: "Failed to generate dashboard spec" },
      { status: 500 },
    );
  }
}
