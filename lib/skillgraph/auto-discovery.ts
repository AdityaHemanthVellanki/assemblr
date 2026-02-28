import type { SkillGraphWorkspace } from "./events/event-schema";
import { createEmptyWorkspace, SkillGraphWorkspaceSchema } from "./events/event-schema";
import { runIngestionPipeline, type OnIngestionProgress } from "./ingestion/ingest-pipeline";
import { runMiningPipeline, type OnMiningProgress } from "./mining/mining-pipeline";
import { compileAllPatterns } from "./compiler/compile-skill";
import { saveSkillVersion } from "./compiler/skill-versioning";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DiscoveryStage =
  | "ingestion"
  | "mining"
  | "compilation"
  | "saving"
  | "complete";

export type DiscoveryProgress = {
  stage: DiscoveryStage;
  status: "running" | "done" | "error";
  message: string;
  detail?: any;
};

export type OnDiscoveryProgress = (progress: DiscoveryProgress) => void;

/**
 * Full auto-discovery pipeline: ingest → mine → compile → save.
 *
 * Can be triggered by:
 *  - New integration connection (POST /api/auth/callback/composio)
 *  - Manual "Run Discovery" button
 *  - Scheduler (GET /api/scheduler)
 */
export async function runAutoDiscovery(params: {
  orgId: string;
  workspaceId: string;
  connectedIntegrationIds: string[];
  onProgress?: OnDiscoveryProgress;
}): Promise<SkillGraphWorkspace> {
  const { orgId, workspaceId, connectedIntegrationIds, onProgress } = params;

  console.log(
    `[AutoDiscovery] Starting for org ${orgId}, workspace ${workspaceId}, ` +
    `${connectedIntegrationIds.length} connected integrations`,
  );

  // Load existing workspace from Project
  let workspace = await loadWorkspace(workspaceId);

  // Stage 1: Ingestion
  onProgress?.({
    stage: "ingestion",
    status: "running",
    message: `Ingesting data from ${connectedIntegrationIds.length} integrations...`,
  });

  try {
    workspace = await runIngestionPipeline({
      orgId,
      connectedIntegrationIds,
      existingWorkspace: workspace,
      onProgress: ((p: any) => {
        onProgress?.({
          stage: "ingestion",
          status: p.status,
          message: p.message,
          detail: p,
        });
      }) as OnIngestionProgress,
    });

    onProgress?.({
      stage: "ingestion",
      status: "done",
      message: `Ingested ${workspace.ingestionState.totalEvents} events`,
    });
  } catch (error: any) {
    console.error("[AutoDiscovery] Ingestion failed:", error);
    onProgress?.({
      stage: "ingestion",
      status: "error",
      message: `Ingestion failed: ${error.message}`,
    });
    // Save partial progress
    await saveWorkspace(workspaceId, workspace);
    throw error;
  }

  // Stage 2: Mining
  onProgress?.({
    stage: "mining",
    status: "running",
    message: "Mining behavioral patterns...",
  });

  try {
    workspace = await runMiningPipeline({
      workspace,
      onProgress: ((p: any) => {
        onProgress?.({
          stage: "mining",
          status: p.status,
          message: p.message,
          detail: p,
        });
      }) as OnMiningProgress,
    });

    onProgress?.({
      stage: "mining",
      status: "done",
      message: `Found ${workspace.minedPatterns.length} patterns`,
    });
  } catch (error: any) {
    console.error("[AutoDiscovery] Mining failed:", error);
    onProgress?.({
      stage: "mining",
      status: "error",
      message: `Mining failed: ${error.message}`,
    });
    await saveWorkspace(workspaceId, workspace);
    throw error;
  }

  // Stage 3: Compilation
  onProgress?.({
    stage: "compilation",
    status: "running",
    message: "Compiling skill graphs...",
  });

  const compiledSkills = compileAllPatterns(workspace.minedPatterns);
  workspace = { ...workspace, compiledSkills };

  onProgress?.({
    stage: "compilation",
    status: "done",
    message: `Compiled ${compiledSkills.length} skill graphs`,
  });

  // Stage 4: Save to DB
  onProgress?.({
    stage: "saving",
    status: "running",
    message: "Saving workspace and skill versions...",
  });

  await saveWorkspace(workspaceId, workspace);

  // Save each compiled skill as a version
  for (const skill of compiledSkills) {
    try {
      await saveSkillVersion({ workspaceId, orgId, skill });
    } catch (error: any) {
      console.warn(`[AutoDiscovery] Failed to save skill version ${skill.id}:`, error.message);
    }
  }

  onProgress?.({
    stage: "complete",
    status: "done",
    message:
      `Discovery complete: ${workspace.ingestionState.totalEvents} events → ` +
      `${workspace.minedPatterns.length} patterns → ${compiledSkills.length} skills`,
  });

  return workspace;
}

/**
 * Load a workspace from the Project table.
 */
async function loadWorkspace(workspaceId: string): Promise<SkillGraphWorkspace> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.from("projects") as any)
    .select("spec")
    .eq("id", workspaceId)
    .single();

  if (error || !data) {
    console.warn(`[AutoDiscovery] Could not load workspace ${workspaceId}, creating empty`);
    return createEmptyWorkspace();
  }

  const parsed = SkillGraphWorkspaceSchema.safeParse(data.spec);
  if (parsed.success) return parsed.data;

  console.warn("[AutoDiscovery] Invalid workspace spec, creating empty");
  return createEmptyWorkspace();
}

/**
 * Save workspace state to the Project.spec JSONB column.
 */
async function saveWorkspace(
  workspaceId: string,
  workspace: SkillGraphWorkspace,
): Promise<void> {
  const supabase = await createSupabaseServerClient();

  const { error } = await (supabase.from("projects") as any)
    .update({
      spec: workspace as any,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  if (error) {
    console.error(`[AutoDiscovery] Failed to save workspace ${workspaceId}:`, error);
    throw new Error(`Failed to save workspace: ${error.message}`);
  }
}
