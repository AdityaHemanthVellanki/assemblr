import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { ViewSpec } from "@/lib/toolos/spec";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runDesignViews(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  if (ctx.spec.entities.length === 0) {
    throw new Error("View spec required but no entities found");
  }
  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON: {"views":[{"id":string,"name":string,"type":"table"|"kanban"|"timeline"|"chat"|"form"|"inspector"|"command"|"detail","source":{"entity":string,"statePath":string},"fields":string[],"actions":string[]}]}.
Only include views that directly answer the user prompt. Do not include unrelated entities. Only reference entities: ${ctx.spec.entities.map((e) => e.name).join(", ") || "none"}.`,
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
  if (content) {
    console.log("[ToolCompilerLLMOutput]", { stage: "design-views", content });
  }
  if (!content) {
    throw new Error("View spec required but model returned empty");
  }
  try {
    const json = JSON.parse(content);
    const rawViews = Array.isArray(json.views) ? json.views : [];
    const filtered = filterRelevantViews(ctx, rawViews);
    if (filtered.length === 0) {
      throw new Error("View spec required but none matched user intent");
    }
    const normalized = normalizeViewFields(ctx, filtered);
    return { specPatch: { views: normalized } };
  } catch {
    throw new Error("View spec required but invalid JSON");
  }
}

function filterRelevantViews(ctx: ToolCompilerStageContext, views: ViewSpec[]): ViewSpec[] {
  const prompt = ctx.prompt.toLowerCase();
  const wantsEmail = prompt.includes("mail") || prompt.includes("email") || prompt.includes("inbox") || prompt.includes("gmail");
  const wantsGithub = prompt.includes("github");
  const wantsLinear = prompt.includes("linear");
  const wantsNotion = prompt.includes("notion");
  const wantsSlack = prompt.includes("slack");
  const entityIntegration = new Map(ctx.spec.entities.map((entity) => [entity.name, entity.sourceIntegration]));
  const matchesIntegration = (view: ViewSpec) => {
    const integration = entityIntegration.get(view.source.entity);
    if (!integration) return false;
    if (wantsEmail && integration === "google") return true;
    if (wantsGithub && integration === "github") return true;
    if (wantsLinear && integration === "linear") return true;
    if (wantsNotion && integration === "notion") return true;
    if (wantsSlack && integration === "slack") return true;
    if (!wantsEmail && !wantsGithub && !wantsLinear && !wantsNotion && !wantsSlack) return true;
    return false;
  };
  return views.filter((view) => matchesIntegration(view));
}

function normalizeViewFields(ctx: ToolCompilerStageContext, views: ViewSpec[]): ViewSpec[] {
  const prompt = ctx.prompt.toLowerCase();
  const wantsEmail = prompt.includes("mail") || prompt.includes("email") || prompt.includes("inbox") || prompt.includes("gmail");
  const entityFields = new Map(ctx.spec.entities.map((entity) => [entity.name, entity.fields.map((field) => field.name)]));
  return views.map((view) => {
    const availableFields = entityFields.get(view.source.entity) ?? view.fields;
    if (wantsEmail) {
      return { ...view, fields: ["from", "subject", "snippet", "date"] };
    }
    if (!Array.isArray(view.fields) || view.fields.length === 0) {
      return { ...view, fields: availableFields.slice(0, 6) };
    }
    return view;
  });
}
