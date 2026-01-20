import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { saveToolMemory, loadToolMemory } from "@/lib/toolos/memory-store";

const bodySchema = z.object({
  paused: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  const paused = await loadToolMemory({
    toolId,
    orgId: ctx.orgId,
    namespace: "tool_builder",
    key: "automation_paused",
  });
  return NextResponse.json({ paused: paused === true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await saveToolMemory({
    toolId,
    orgId: ctx.orgId,
    namespace: "tool_builder",
    key: "automation_paused",
    value: parsed.data.paused ?? false,
  });
  return NextResponse.json({ paused: parsed.data.paused ?? false });
}
