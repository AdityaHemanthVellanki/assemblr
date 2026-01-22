
import { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runFetchData(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  // PURE COMPILER STAGE:
  // Does NOT execute actions.
  // Does NOT materialize.
  // Just validates that if initialFetch is present, the action exists.
  
  const { spec } = ctx;

  if (spec.initialFetch?.actionId) {
      const action = spec.actions?.find(a => a.id === spec.initialFetch?.actionId);
      if (!action) {
          console.warn(`[ToolCompiler] Initial fetch action ${spec.initialFetch.actionId} not found in actions.`);
      }
  }

  return {};
}
