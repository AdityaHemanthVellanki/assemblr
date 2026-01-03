import { DASHBOARD_SPEC_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { parseDashboardSpec, type DashboardSpec } from "@/lib/spec/dashboardSpec";

type GenerateDashboardSpecOptions = {
  prompt: string;
  systemPrompt?: string;
};

export type LlmGenerate = (input: {
  system: string;
  user: string;
}) => Promise<string>;

export function parseAndValidateDashboardSpecFromJsonText(jsonText: string) {
  // Strict JSON validation
  if (!jsonText.trim().startsWith("{")) {
    throw new Error("AI returned non-JSON response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  return parseDashboardSpec(parsed);
}

async function defaultLlm(input: { system: string; user: string }) {
  const { azureOpenAIClient } = await import("./azureOpenAI");
  const { getServerEnv } = await import("@/lib/env");
  getServerEnv();

  try {
    const res = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
    });

    const content = res.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") {
      throw new Error("Azure OpenAI returned empty content");
    }

    // Strict JSON validation
    if (!content.trim().startsWith("{")) {
       console.error("AI returned non-JSON response (parsed)", { content });
       throw new Error("AI returned non-JSON response");
    }

    return content;
  } catch (err) {
    console.error("Azure OpenAI error", err);
    throw new Error("AI service unavailable");
  }
}

export async function generateDashboardSpec(
  options: GenerateDashboardSpecOptions,
  deps: { llm?: LlmGenerate } = {},
): Promise<DashboardSpec> {
  const rawPrompt = options.prompt ?? "";
  const prompt = rawPrompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required");
  }

  const llm = deps.llm ?? defaultLlm;

  let outputText: string;
  try {
    outputText = await llm({
      system: options.systemPrompt ?? DASHBOARD_SPEC_SYSTEM_PROMPT,
      user: prompt,
    });
  } catch (err) {
    console.error("generateDashboardSpec: LLM call failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  try {
    return parseAndValidateDashboardSpecFromJsonText(outputText);
  } catch (err) {
    console.error("generateDashboardSpec: validation failed", {
      prompt: prompt.slice(0, 200),
      output: outputText.slice(0, 2000),
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
