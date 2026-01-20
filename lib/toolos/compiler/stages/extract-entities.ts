import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runExtractEntities(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  // Heuristic: Handle simple entity declarations directly to avoid LLM roundtrip/failure
  const answerMatch = ctx.prompt.match(/User answers:\s*(.+)$/i);
  const userAnswer = answerMatch ? answerMatch[1].trim().toLowerCase() : ctx.prompt.trim().toLowerCase();

  if (userAnswer === "repos" || userAnswer === "repositories") {
    return {
      specPatch: {
        entities: [{
          name: "Repo",
          sourceIntegration: "github",
          identifiers: ["id", "fullName"],
          supportedActions: ["github.repos.list"],
          fields: [{ name: "name", type: "string", required: true }, { name: "owner", type: "string" }]
        }]
      }
    };
  }
  if (userAnswer === "issues") {
    return {
      specPatch: {
        entities: [{
          name: "Issue",
          sourceIntegration: "linear",
          identifiers: ["id"],
          supportedActions: ["linear.issues.list"],
          fields: [{ name: "title", type: "string", required: true }, { name: "status", type: "string" }]
        }]
      }
    };
  }

  const integrations = Array.from(
    new Set(ctx.spec.integrations.map((i) => i.id)),
  );
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON: {"entities":[{"name":string,"fields":[{"name":string,"type":string,"required":boolean}],"sourceIntegration":string,"identifiers":string[],"supportedActions":string[],"relations":[]}]}.
Only use integrations from this list: ${integrations.join(", ") || "google, slack, github, linear, notion"}.`,
      },
      { role: "user", content: ctx.prompt },
    ],
    temperature: 0,
    max_tokens: 400,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (!content) return { specPatch: { entities: [] } };
  try {
    const json = JSON.parse(content);
    const entities = Array.isArray(json.entities)
      ? json.entities.filter((entity: any) => entity && typeof entity.name === "string")
      : [];
    return { specPatch: { entities } };
  } catch {
    return { specPatch: { entities: [] } };
  }
}
