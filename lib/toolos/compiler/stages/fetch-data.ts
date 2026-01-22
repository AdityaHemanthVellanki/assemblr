
import { executeToolAction } from "@/lib/toolos/runtime";
import { saveMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";
import { materializeToolOutput, finalizeToolEnvironment, getLatestToolResult } from "@/lib/toolos/materialization";

export async function runFetchData(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const { spec, orgId, toolId, userId } = ctx;
  
  // 1. Identify all READ actions to execute
  // We want to populate as much of the environment as possible.
  // The user requires a "Tool Environment Finalization Phase" that persists a unified object.
  let readActions = (spec.actions || []).filter(
    (action) => action.type === "READ" || action.id.includes("list") || action.id.includes("search"),
  );

  // If initialFetch is specified, prioritize it or ensure it's included
  if (spec.initialFetch?.actionId) {
      const initial = spec.actions.find(a => a.id === spec.initialFetch?.actionId);
      if (initial && !readActions.find(a => a.id === initial.id)) {
          readActions.unshift(initial);
      }
  }

  // If no read actions, we still MUST finalize the environment to READY state
  // so the UI can render (e.g. empty state or just the layout).
  if (readActions.length === 0) {
     console.log(`[ToolCompiler] No read actions found. Finalizing empty environment for ${toolId}`);
     await finalizeToolEnvironment(toolId, orgId, spec, [], null);
     return {};
  }

  const compiledTool = buildCompiledToolArtifact(spec);
  const actionOutputs: Array<{ action: any; output: any; error?: any }> = [];
  
  // 2. Execute actions (sequentially for now to be safe with rate limits)
  for (const action of readActions) {
      try {
        const input = { limit: spec.initialFetch?.limit ?? 10 };
        console.log(`[ToolCompiler] Executing initial fetch for action ${action.id}...`);
        
        const result = await executeToolAction({
            orgId,
            toolId,
            compiledTool,
            actionId: action.id,
            input,
            userId,
            triggerId: "compiler_fetch",
            recordRun: false, 
        });
        
        actionOutputs.push({ action, output: result.output });
        
        // Persist evidence (best effort)
        const scope: MemoryScope = { type: "tool_org", toolId, orgId };
        saveMemory({
            scope,
            namespace: "tool_builder",
            key: "data_evidence",
            value: {
                actionId: action.id,
                timestamp: new Date().toISOString(),
                sample: result.output,
            },
        }).catch(e => console.error("[DataEvidence] Failed to save:", e));

      } catch (err) {
          console.warn(`[ToolCompiler] Action ${action.id} failed during initial fetch:`, err);
          actionOutputs.push({ action, output: null, error: err });
          // We continue! Slack failure must not block others.
      }
  }

  // 3. Finalize Tool Environment (REQUIRED)
  // This will persist records and set status = READY via finalizeToolEnvironment -> materializeToolOutput
  try {
      const matResult = await finalizeToolEnvironment(
          toolId, 
          orgId, 
          spec, 
          actionOutputs, 
          null // Initial fetch
      );
      console.log(`[ToolCompiler] Environment finalized. Status: ${matResult.status}, Records: ${matResult.recordCount}`);
      
      if (matResult.status === "FAILED") {
          // If explicitly failed (all actions failed), we might want to log it as such.
          console.error(`[ToolCompiler] Tool environment finalization resulted in FAILED state.`);
      }
  } catch (err) {
      console.error(`[ToolCompiler] Failed to finalize environment:`, err);
      throw err;
  }

  return {};
}
