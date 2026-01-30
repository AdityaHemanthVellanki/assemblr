import { validateToolSystem } from "@/lib/toolos/compiler";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runValidateSpec(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  if (!ctx.spec) {
    return { clarifications: [] };
  }

  const validation = validateToolSystem(ctx.spec);
  if (validation.errors.length > 0) {
    throw new Error(`ToolSpec Validation Failed:\n${validation.errors.join("\n")}`);
  }

  return { clarifications: [] };
}
