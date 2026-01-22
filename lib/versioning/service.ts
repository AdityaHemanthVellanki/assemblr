import { randomUUID } from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ToolSpec } from "@/lib/spec/toolSpec";
import { ToolVersion, VersionStatus, VersionValidationResult } from "@/lib/core/versioning";
import { calculateDiff } from "./diff";
import { CompiledIntent } from "@/lib/core/intent";
import { createHash } from "crypto";

export class VersioningService {
  
  async createDraft(
    toolId: string, 
    newSpec: ToolSpec, 
    userId: string,
    intent?: CompiledIntent,
    baseVersionId?: string
  ): Promise<ToolVersion> {
    // Use Admin Client for versioning to ensure persistence reliability
    const supabase = createSupabaseAdminClient();
    
    let baseSpec: ToolSpec = {
      id: toolId,
      name: "New Tool",
      purpose: "New Tool",
      entities: [],
      stateGraph: { nodes: [], edges: [] },
      state: { initial: {}, reducers: [], graph: { nodes: [], edges: [] } },
      actions: [],
      workflows: [],
      triggers: [],
      views: [],
      permissions: { roles: [], grants: [] },
      integrations: [],
      memory: { tool: { namespace: toolId, retentionDays: 30, schema: {} }, user: { namespace: toolId, retentionDays: 30, schema: {} } },
      automations: {
        enabled: true,
        capabilities: { canRunWithoutUI: true, supportedTriggers: [], maxFrequency: 1440, safetyConstraints: [] },
      },
      observability: {
        executionTimeline: true,
        recentRuns: true,
        errorStates: true,
        integrationHealth: true,
        manualRetryControls: true,
      },
    };
    
    if (baseVersionId) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec")
        .eq("id", baseVersionId)
        .single();
      if (version?.tool_spec) baseSpec = version.tool_spec as ToolSpec;
    } else {
      const { data: project } = await (supabase.from("projects") as any)
        .select("active_version_id, spec")
        .eq("id", toolId)
        .single();
      if (project?.active_version_id) {
        const { data: version } = await (supabase.from("tool_versions") as any)
          .select("tool_spec")
          .eq("id", project.active_version_id)
          .single();
        if (version?.tool_spec) baseSpec = version.tool_spec as ToolSpec;
      } else if (project?.spec) {
        baseSpec = project.spec as ToolSpec;
      }
    }

    const diff = calculateDiff(baseSpec, newSpec);

    const version: ToolVersion = {
        id: randomUUID(),
        tool_id: toolId,
        created_at: new Date().toISOString(),
        created_by: userId,
        intent_summary: intent?.system_goal || "Manual Edit",
        mini_app_spec: newSpec,
        status: "draft",
        diff
    };

    const compiledTool = {
      compiledAt: new Date().toISOString(),
      specHash: createHash("sha256").update(JSON.stringify(newSpec)).digest("hex"),
    };
    const { error } = await (supabase.from("tool_versions") as any).insert({
      id: version.id,
      tool_id: version.tool_id,
      created_at: version.created_at,
      created_by: version.created_by,
      intent_summary: version.intent_summary,
      status: version.status,
      name: newSpec.name,
      purpose: newSpec.purpose,
      tool_spec: newSpec,
      compiled_tool: compiledTool,
      diff,
    });
    if (error) throw new Error(error.message);

    return version;
  }

  async promoteVersion(toolId: string, versionId: string): Promise<void> {
      const supabase = await createSupabaseServerClient();
      
      // 1. Fetch Version
      const { data: version } = await (supabase.from("tool_versions") as any).select("*").eq("id", versionId).single();
      if (!version) throw new Error("Version not found");

      await (supabase.from("projects") as any).update({
          spec: version.tool_spec ?? version.mini_app_spec,
          active_version_id: versionId
      }).eq("id", toolId);

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
