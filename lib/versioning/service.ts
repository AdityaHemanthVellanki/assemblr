import { randomUUID } from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
    let baseSpec: ToolSpec = {
      id: toolId,
      purpose: "New Tool",
      entities: [],
      state: { initial: {}, reducers: [], graph: { nodes: [], edges: [] } },
      actions: [],
      workflows: [],
      triggers: [],
      views: [],
      permissions: { roles: [], grants: [] },
      integrations: [],
      memory: { tool: { namespace: toolId, retentionDays: 30, schema: {} }, user: { namespace: toolId, retentionDays: 30, schema: {} } },
    };
    
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
        // Gracefully strip compiled_intent if persistence schema doesn't support it yet
        // compiled_intent: intent, 
        mini_app_spec: newSpec,
        status: "draft",
        diff
    };

    // SAFE PERSISTENCE: Best-effort only. Never throw.
    try {
        // Known allowed columns - protect against schema drift
        // We whitelist only the columns we know exist or are critical.
        // If the DB has extra columns, they should be nullable.
        // If the DB is missing columns, we avoid sending them.
        const ALLOWED_COLUMNS = [
            "id", "tool_id", "created_at", "intent_summary", 
            "mini_app_spec", "status", "diff"
        ];
        
        // Pick only allowed columns
        const safePayload: any = {};
        for (const col of ALLOWED_COLUMNS) {
            if ((version as any)[col] !== undefined) {
                safePayload[col] = (version as any)[col];
            }
        }
        
        // Attempt insert
        const { error } = await (supabase.from("tool_versions") as any).insert(safePayload);
        
        if (error) {
            console.warn(`[VersioningService] Persistence failed (non-fatal): ${error.message}. Falling back to ephemeral mode.`);
            version.mode = "ephemeral";
        } else {
            version.mode = "persistent";
        }
    } catch (e) {
        console.warn("[VersioningService] Persistence exception (non-fatal). Falling back to ephemeral mode.", e);
        version.mode = "ephemeral";
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
