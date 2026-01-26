import { z } from "zod";

import { requireOrgMember } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { saveMemory, loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { getLatestToolResult } from "@/lib/toolos/materialization";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  paused: z.boolean().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
    const paused = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "automation_paused",
    });
    return jsonResponse({ paused: paused === true });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();
    const { data: project } = await (supabase.from("projects") as any)
      .select("org_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();
    if (!project) {
      return errorResponse("Tool not found", 404);
    }
    const latestResult = await getLatestToolResult(toolId, ctx.orgId);
    if (!latestResult) {
      return errorResponse("No committed snapshot", 409, {
        status: "failed",
        reason: "No committed snapshot",
      });
    }
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }
    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
    await saveMemory({
      scope,
      namespace: "tool_builder",
      key: "automation_paused",
      value: parsed.data.paused ?? false,
    });
    return jsonResponse({ paused: parsed.data.paused ?? false });
  } catch (e) {
    return handleApiError(e);
  }
}
