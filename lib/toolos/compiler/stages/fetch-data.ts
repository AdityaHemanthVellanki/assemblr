
import { executeToolAction } from "@/lib/toolos/runtime";
import { saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runFetchData(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const { spec, orgId, toolId } = ctx as any; // Assuming orgId/toolId available in ctx via cast or update type
  
  if (!spec.actions || spec.actions.length === 0) {
    // Actions not defined yet, can't fetch. 
    // This stage should run after define-actions.
    return { clarifications: ["Define actions before fetching data."] };
  }

  // Determine what to fetch
  let actionId = spec.initialFetch?.actionId;
  let input = { limit: spec.initialFetch?.limit ?? 10 };

  if (!actionId) {
    // Heuristic: Find first READ action
    const readAction = spec.actions.find(a => a.type === "READ" || a.id.includes("list") || a.id.includes("search"));
    if (readAction) {
      actionId = readAction.id;
    }
  }

  if (!actionId) {
    return { clarifications: ["No read action found to fetch initial data."] };
  }

  try {
    const compiledTool = buildCompiledToolArtifact(spec);
    
    // We need to use the runtime to fetch
    // Note: The user performing the compile is the one whose token we use
    const userId = ctx.userId; // We need to add userId to ToolCompilerStageContext

    const result = await executeToolAction({
      orgId,
      toolId,
      compiledTool,
      actionId,
      input,
      userId,
      triggerId: "compiler_fetch",
      recordRun: false, // Don't pollute execution history with build fetches? Or maybe we should?
    });

    // Persist evidence
    const scope: MemoryScope = { type: "tool_org", toolId, orgId };
    await saveMemory({
      scope,
      namespace: "tool_builder",
      key: "data_evidence",
      value: {
        actionId,
        timestamp: new Date().toISOString(),
        sample: result.output,
      },
    });

    // If successful, we might want to update the spec to lock this as the initialFetch
    if (!spec.initialFetch) {
        return {
            specPatch: {
                initialFetch: {
                    actionId,
                    entity: spec.entities[0]?.name ?? "Unknown",
                    integrationId: spec.actions.find(a => a.id === actionId)?.integrationId ?? "google",
                    limit: 10
                }
            }
        };
    }

    return {};

  } catch (err) {
    console.error("Data fetch stage failed", err);
    return {
      clarifications: [
        `Failed to fetch data using action '${actionId}': ${err instanceof Error ? err.message : String(err)}`,
        "Please ensure integrations are connected and permissions are granted."
      ]
    };
  }
}
