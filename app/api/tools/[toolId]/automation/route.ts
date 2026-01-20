import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { saveMemory, loadMemory, MemoryScope } from "@/lib/toolos/memory-store";

const bodySchema = z.object({
  paused: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
  const paused = await loadMemory({
    scope,
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
  const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
  await saveMemory({
    scope,
    namespace: "tool_builder",
    key: "automation_paused",
    value: parsed.data.paused ?? false,
  });
  return NextResponse.json({ paused: parsed.data.paused ?? false });
}
