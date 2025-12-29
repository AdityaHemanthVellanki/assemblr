import { NextResponse } from "next/server";
import { z } from "zod";

import {
  PermissionError,
  requireRole,
} from "@/lib/auth/permissions";
import { generateDashboardSpec } from "@/lib/ai/generateDashboardSpec";
import { getServerEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("editor"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
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

  const supabase = await createSupabaseServerClient();

  try {
    const spec = await generateDashboardSpec({
      prompt: bodyResult.data.prompt,
    });

    const updatedRes = await supabase
      .from("projects")
      .update({ spec })
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .select("id, name, spec, created_at, updated_at")
      .maybeSingle();

    if (updatedRes.error) {
      console.error("generate-spec update failed", {
        userId,
        orgId: ctx.orgId,
        projectId: id,
        message: updatedRes.error.message,
      });
      return NextResponse.json({ error: "Failed to save generated spec" }, { status: 500 });
    }

    if (!updatedRes.data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      project: {
        id: updatedRes.data.id as string,
        name: updatedRes.data.name as string,
        spec: updatedRes.data.spec,
        createdAt: new Date(updatedRes.data.created_at as string),
        updatedAt: new Date(updatedRes.data.updated_at as string),
      },
    });
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
