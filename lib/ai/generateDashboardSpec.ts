import { DASHBOARD_SPEC_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { parseDashboardSpec, type DashboardSpec } from "@/lib/dashboard/spec";

type GenerateDashboardSpecOptions = {
  prompt: string;
};

export type LlmGenerate = (input: {
  system: string;
  user: string;
}) => Promise<string>;

export function parseAndValidateDashboardSpecFromJsonText(jsonText: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  return parseDashboardSpec(parsed);
}

async function defaultLlm(input: { system: string; user: string }) {
  const { callOpenAiChat } = await import("./openai-chat");
  return callOpenAiChat(input);
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
      system: DASHBOARD_SPEC_SYSTEM_PROMPT,
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
