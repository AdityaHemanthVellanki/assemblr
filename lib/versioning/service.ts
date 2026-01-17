import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DashboardSpec } from "@/lib/spec/dashboardSpec";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { ToolVersion, VersionStatus, VersionValidationResult } from "@/lib/core/versioning";
import { calculateDiff } from "./diff";
import { CompiledIntent } from "@/lib/core/intent";

export class VersioningService {
  
  async createDraft(
    toolId: string, 
    newSpec: ToolSpec, 
    userId: string,
    intent?: CompiledIntent,
    baseVersionId?: string
  ): Promise<ToolVersion> {
    const supabase = await createSupabaseServerClient();
    
    // 1. Fetch Base Spec (Active or Specific Version)
    let baseSpec: ToolSpec = { kind: "mini_app", title: "New Tool", pages: [], actions: [], state: [] };
    
    // Check if we have an active version if baseVersionId is not provided
    if (!baseVersionId) {
        const { data: project } = await supabase.from("projects").select("active_version_id, spec").eq("id", toolId).single() as any;
        // If legacy project without versioning, use spec as base
        if (project?.spec) baseSpec = project.spec as ToolSpec;
        // TODO: In future, fetch from tool_versions table using active_version_id
    }

    // 2. Calculate Diff
    const diff = calculateDiff(baseSpec, newSpec);

    // 3. Create Version Object
    const version: ToolVersion = {
        id: randomUUID(),
        tool_id: toolId,
        created_at: new Date().toISOString(),
        created_by: userId,
        intent_summary: intent?.system_goal || "Manual Edit",
        compiled_intent: intent,
        mini_app_spec: newSpec,
        status: "draft",
        diff
    };

    const { error } = await (supabase.from("tool_versions") as any).insert(version);
    if (error) {
      throw new Error(`Failed to persist version to tool_versions table: ${error.message ?? "Unknown error"}`);
    }

    return version;
  }

  async promoteVersion(toolId: string, versionId: string): Promise<void> {
      const supabase = await createSupabaseServerClient();
      
      // 1. Fetch Version
      const { data: version } = await (supabase.from("tool_versions") as any).select("*").eq("id", versionId).single();
      if (!version) throw new Error("Version not found");

      // 2. Update Project Active Version
      await supabase.from("projects").update({
          spec: version.mini_app_spec, // Legacy support: sync active spec to project.spec
          active_version_id: versionId
      } as any).eq("id", toolId);

      // 3. Update Version Status
      await (supabase.from("tool_versions") as any).update({ status: "active" }).eq("id", versionId);
  }

  async getLatestDraft(toolId: string): Promise<ToolVersion | null> {
      const supabase = await createSupabaseServerClient();
      const { data } = await (supabase.from("tool_versions") as any)
        .select("*")
        .eq("tool_id", toolId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      return data as ToolVersion;
  }
}
