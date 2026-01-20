import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { ViewSpec } from "@/lib/toolos/spec";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runDesignViews(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  if (ctx.spec.entities.length === 0) {
    return { specPatch: { views: buildFallbackViews(ctx) } };
  }
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON: {"views":[{"id":string,"name":string,"type":"table"|"kanban"|"timeline"|"chat"|"form"|"inspector"|"command","source":{"entity":string,"statePath":string},"fields":string[],"actions":string[]}]}.
Only reference entities: ${ctx.spec.entities.map((e) => e.name).join(", ") || "none"}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt: ctx.prompt,
          entities: ctx.spec.entities.map((e) => ({ name: e.name, fields: e.fields.map((f) => f.name) })),
          actions: ctx.spec.actions.map((a) => ({ id: a.id, name: a.name, integrationId: a.integrationId })),
        }),
      },
    ],
    temperature: 0,
    max_tokens: 400,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (!content) return { specPatch: { views: buildFallbackViews(ctx) } };
  try {
    const json = JSON.parse(content);
    const views = Array.isArray(json.views) ? json.views : [];
    return { specPatch: { views: views.length > 0 ? views : buildFallbackViews(ctx) } };
  } catch {
    return { specPatch: { views: buildFallbackViews(ctx) } };
  }
}

function buildFallbackViews(ctx: ToolCompilerStageContext): ViewSpec[] {
  if (ctx.spec.entities.length > 0) {
    return ctx.spec.entities.map((entity): ViewSpec => {
      const actions = ctx.spec.actions.filter((action) => action.integrationId === entity.sourceIntegration);
      const type: ViewSpec["type"] =
        entity.name.toLowerCase().includes("issue") || entity.name.toLowerCase().includes("task")
          ? "kanban"
          : "table";
      return {
        id: `view.${slug(entity.name)}`,
        name: entity.name,
        type,
        source: { entity: entity.name, statePath: `${entity.sourceIntegration}.${slug(entity.name)}s` },
        fields: entity.fields.map((f) => f.name).slice(0, 6),
        actions: actions.map((a) => a.id),
      };
    });
  }
  return ctx.spec.integrations.map((integration): ViewSpec => ({
    id: `view.${integration.id}`,
    name: integration.id.toUpperCase(),
    type: "table",
    source: { entity: integration.id, statePath: `${integration.id}.data` },
    fields: [],
    actions: ctx.spec.actions.filter((a) => a.integrationId === integration.id).map((a) => a.id),
  }));
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
