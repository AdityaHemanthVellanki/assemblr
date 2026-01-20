import { NextResponse } from "next/server";

import { requireOrgMember, requireProjectOrgAccess } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ToolSystemSpec } from "@/lib/toolos/spec";

type VersionSummary = {
  id: string;
  status: string;
  created_at: string;
  created_by: string | null;
  prompt_used: string;
  integrations_used: string[];
  workflows_count: number;
  triggers_count: number;
  breaking_change: boolean;
  diff: Record<string, any> | null;
  tool_spec: ToolSystemSpec;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  const { toolId } = await params;
  const { ctx } = await requireOrgMember();
  await requireProjectOrgAccess(ctx, toolId);
  const supabase = await createSupabaseServerClient();

  const { data: project } = await (supabase.from("projects") as any)
    .select("active_version_id")
    .eq("id", toolId)
    .eq("org_id", ctx.orgId)
    .single();

  const { data, error } = await (supabase.from("tool_versions") as any)
    .select("id, status, created_at, created_by, purpose, tool_spec, diff, compiled_intent")
    .eq("tool_id", toolId)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load versions" }, { status: 500 });
  }

  const versions: VersionSummary[] = (data ?? []).map((row: any) => {
    const spec = row.tool_spec as ToolSystemSpec;
    const integrations =
      Array.isArray(spec?.integrations) && spec.integrations.length > 0
        ? spec.integrations.map((i) => i.id)
        : Array.from(
            new Set((spec?.actions ?? []).map((action) => action.integrationId).filter(Boolean)),
          );
    const diff = row.diff ?? null;
    const breakingChange = Boolean(
      diff &&
        (diff.permissions_changed === true ||
          (Array.isArray(diff.integrations_changed) && diff.integrations_changed.length > 0) ||
          (Array.isArray(diff.pages_removed) && diff.pages_removed.length > 0) ||
          (Array.isArray(diff.actions_removed) && diff.actions_removed.length > 0) ||
          (Array.isArray(diff.workflows_removed) && diff.workflows_removed.length > 0) ||
          (Array.isArray(diff.triggers_removed) && diff.triggers_removed.length > 0) ||
          (Array.isArray(diff.views_removed) && diff.views_removed.length > 0) ||
          (Array.isArray(diff.entities_removed) && diff.entities_removed.length > 0)),
    );
    return {
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      created_by: row.created_by ?? null,
      prompt_used: row.compiled_intent?.system_goal ?? row.purpose ?? "Manual Edit",
      integrations_used: integrations,
      workflows_count: spec?.workflows?.length ?? 0,
      triggers_count: spec?.triggers?.length ?? 0,
      breaking_change: breakingChange,
      diff,
      tool_spec: spec,
    };
  });

  return NextResponse.json({
    active_version_id: project?.active_version_id ?? null,
    versions,
  });
}
