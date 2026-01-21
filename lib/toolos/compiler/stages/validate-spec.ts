import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runValidateSpec(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  if (!ctx.spec) {
    return { clarifications: [] };
  }
  return { clarifications: [] };
}
