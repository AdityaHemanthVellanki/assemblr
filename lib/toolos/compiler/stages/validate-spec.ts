import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runValidateSpec(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const clarifications: string[] = [];
  if (!ctx.spec.name || ctx.spec.name.trim().length === 0) {
    clarifications.push("Provide a tool name.");
  }
  if (!ctx.spec.purpose || ctx.spec.purpose.trim().length === 0) {
    clarifications.push("Provide the tool purpose.");
  }
  if (ctx.spec.integrations.length === 0) {
    clarifications.push("Which integrations should this tool use?");
  }
  if (ctx.spec.actions.length === 0) {
    clarifications.push("Which actions should this tool support?");
  }
  if (ctx.spec.entities.length === 0) {
    clarifications.push("Which entities should this tool manage?");
  }
  if (ctx.spec.views.length === 0) {
    clarifications.push("What views should be shown?");
  }
  return { clarifications };
}
