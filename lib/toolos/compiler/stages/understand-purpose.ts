import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runUnderstandPurpose(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content: `Return JSON: {"name": string, "purpose": string}. Keep name under 6 words.`,
      },
      { role: "user", content: ctx.prompt },
    ],
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (content) {
    console.log("[ToolCompilerLLMOutput]", { stage: "understand-purpose", content });
  }
  if (!content) {
    return { specPatch: { purpose: ctx.prompt, name: "Tool" } };
  }
  try {
    const json = JSON.parse(content);
    const purpose = typeof json.purpose === "string" && json.purpose.trim().length > 0 ? json.purpose.trim() : ctx.prompt;
    const name = typeof json.name === "string" && json.name.trim().length > 0 ? json.name.trim() : "Tool";
    return { specPatch: { purpose, name } };
  } catch {
    return { specPatch: { purpose: ctx.prompt, name: "Tool" } };
  }
}
