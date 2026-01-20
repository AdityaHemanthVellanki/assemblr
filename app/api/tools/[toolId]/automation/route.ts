import { NextResponse } from "next/server";
import { z } from "zod";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  const supabase = await createSupabaseServerClient();
  const { data: project } = await (supabase.from("projects") as any)
    .select("is_activated")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }
  if (!project.is_activated) {
    return NextResponse.json(
      {
        status: "blocked",
        reason: "Tool not activated",
        action: "Activate the tool before adjusting automation",
      },
      { status: 409 },
    );
  }
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
