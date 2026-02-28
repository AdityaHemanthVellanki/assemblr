import type { SkillGraph } from "./skill-schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Skill Versioning — stores compiled skill graphs via the existing tool_versions table.
 *
 * Mapping:
 *  - tool_versions.tool_id → workspace Project.id
 *  - tool_versions.mini_app_spec → SkillGraph JSON
 *  - tool_versions.status → skill status ("draft", "compiled", "active")
 */

export async function saveSkillVersion(params: {
  workspaceId: string;
  orgId: string;
  skill: SkillGraph;
}): Promise<string> {
  const { workspaceId, skill } = params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.from("tool_versions") as any)
    .insert({
      tool_id: workspaceId,
      mini_app_spec: skill,
      status: skill.status || "compiled",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[SkillVersioning] Failed to save skill version:", error);
    throw new Error(`Failed to save skill version: ${error.message}`);
  }

  console.log(
    `[SkillVersioning] Saved version ${data.id} for skill "${skill.name}" ` +
    `in workspace ${workspaceId}`,
  );

  return data.id;
}

export async function listSkillVersions(
  workspaceId: string,
): Promise<Array<{ id: string; skill: SkillGraph; status: string; createdAt: string }>> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.from("tool_versions") as any)
    .select("id, mini_app_spec, status, created_at")
    .eq("tool_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[SkillVersioning] Failed to list versions:", error);
    return [];
  }

  return (data || [])
    .filter((v: any) => v.mini_app_spec?.id?.startsWith("skill_"))
    .map((v: any) => ({
      id: v.id,
      skill: v.mini_app_spec as SkillGraph,
      status: v.status,
      createdAt: v.created_at,
    }));
}

export async function getLatestSkillVersion(
  workspaceId: string,
  skillId: string,
): Promise<{ id: string; skill: SkillGraph; status: string } | null> {
  const versions = await listSkillVersions(workspaceId);
  const matching = versions.find((v) => v.skill.id === skillId);
  return matching || null;
}
