import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runBuildWorkflows(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON: {"workflows":[{"id":string,"name":string,"description":string,"nodes":[{"id":string,"type":"action"|"condition"|"transform"|"wait","actionId":string}],"edges":[{"from":string,"to":string}],"retryPolicy":{"maxRetries":number,"backoffMs":number},"timeoutMs":number}],"triggers":[{"id":string,"name":string,"type":"cron"|"webhook"|"integration_event"|"state_condition","condition":object,"actionId":string,"workflowId":string,"enabled":boolean}]}.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt: ctx.prompt,
          actions: ctx.spec.actions.map((a) => ({ id: a.id, name: a.name })),
        }),
      },
    ],
    temperature: 0,
    max_tokens: 400,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (!content) return { specPatch: { workflows: [], triggers: [] } };
  try {
    const json = JSON.parse(content);
    const workflows = Array.isArray(json.workflows) ? json.workflows : [];
    const triggers = Array.isArray(json.triggers) ? json.triggers : [];
    return { specPatch: { workflows, triggers } };
  } catch {
    return { specPatch: { workflows: [], triggers: [] } };
  }
}
