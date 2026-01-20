import { NextResponse } from "next/server";
import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { validateMRT } from "@/lib/toolos/mrt";
import { executeToolAction } from "@/lib/toolos/runtime";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  await requireProjectOrgAccess(ctx, toolId);
  const supabase = await createSupabaseServerClient();

  const { data: project, error } = await (supabase.from("projects") as any)
    .select("spec, active_version_id, is_activated")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  if (error || !project?.spec) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }

  let spec = project.spec;
  let compiledTool: any = null;
  if (project.active_version_id) {
    const { data: version } = await (supabase.from("tool_versions") as any)
      .select("tool_spec, compiled_tool")
      .eq("id", project.active_version_id)
      .single();
    spec = version?.tool_spec ?? spec;
    compiledTool = version?.compiled_tool ?? null;
  }

  if (!isToolSystemSpec(spec)) {
    return NextResponse.json({ error: "Invalid tool spec" }, { status: 422 });
  }

  // Check lifecycle state from memory if not in spec
  const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
  const lifecycleState = await loadMemory({
    scope,
    namespace: "tool_builder",
    key: "lifecycle_state",
  });

  // We are about to activate, so pass true for isActivated check to simulate post-activation state
  // But actually validateMRT checks if it IS activated.
  // We want to check if it CAN be activated.
  // So we pass true to pretend we are checking "if I activate this, is it runnable?"
  // Wait, MRT says "lifecycle === ACTIVATED", which implies the check is "is it currently running?".
  // But here we are TRYING to activate.
  // So we should check the structure constraints manually or adapt validateMRT.
  // Let's rely on validateMRT but ignore the isActivated check for the *pre-check*.
  
  const validation = validateMRT(spec, true, lifecycleState as any);
  if (!validation.runnable) {
    return NextResponse.json(
      { error: "Tool is not runnable", details: validation.errors },
      { status: 422 }
    );
  }

  // 1. Initial Fetch
  if (!compiledTool) {
     compiledTool = buildCompiledToolArtifact(spec);
  }

  const initialFetch = spec.initialFetch;
  if (initialFetch) {
    try {
      await executeToolAction({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        actionId: initialFetch.actionId,
        input: { limit: initialFetch.limit },
        userId: ctx.userId,
        triggerId: "activation",
      });
    } catch (e) {
      console.error("Initial fetch failed", e);
      return NextResponse.json(
        { error: "Initial fetch failed", details: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      );
    }
  } else {
    // Attempt fallback first fetch if no explicit config
    // Find first read action
    const readAction = spec.actions.find(a => a.id.includes("list") || a.id.includes("get") || a.id.includes("search"));
    if (readAction) {
        try {
            await executeToolAction({
                orgId: ctx.orgId,
                toolId,
                compiledTool,
                actionId: readAction.id,
                input: { limit: 10 },
                userId: ctx.userId,
                triggerId: "activation",
            });
        } catch (e) {
            console.warn("Fallback initial fetch failed", e);
            // Don't fail activation for fallback
        }
    }
  }

  // 2. Activate
  const { error: updateError } = await (supabase.from("projects") as any)
    .update({ is_activated: true })
    .eq("id", toolId)
    .eq("org_id", ctx.orgId);

  if (updateError) {
    return NextResponse.json({ error: "Failed to activate tool" }, { status: 500 });
  }

  return NextResponse.json({ status: "activated" });
}
