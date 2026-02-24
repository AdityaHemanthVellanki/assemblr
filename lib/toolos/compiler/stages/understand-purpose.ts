import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

/**
 * Enterprise-grade purpose analysis stage.
 *
 * Produces:
 * - name: concise tool name (max 6 words)
 * - purpose: user-facing description of what the tool does
 * - toolDescription: detailed explanation for end users showing in the UI
 * - goal_plan: structured goal with kind, sub-goals, constraints
 * - intent_contract: success criteria, required entities, heuristics
 */
export async function runUnderstandPurpose(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const connectedList = ctx.connectedIntegrationIds?.length > 0
    ? ctx.connectedIntegrationIds.join(", ")
    : "github, linear, notion, slack";

  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content: `You are an enterprise tool intelligence engine. Analyze the user's request and produce a comprehensive tool specification.

Return JSON with this exact structure:
{
  "name": string,
  "purpose": string,
  "toolDescription": string,
  "goal_plan": {
    "kind": "DATA_RETRIEVAL" | "TRANSFORMATION" | "PLANNING" | "ANALYSIS",
    "primary_goal": string,
    "sub_goals": [string],
    "constraints": [string],
    "derived_entities": [{"name": string, "description": string, "fields": [{"name": string, "type": string}]}]
  },
  "intent_contract": {
    "userGoal": string,
    "successCriteria": [string],
    "implicitConstraints": [string],
    "hiddenStateRequirements": [string],
    "timeHorizon": {"window": string, "rationale": string},
    "subjectivityScore": number,
    "requiredEntities": {"integrations": [string], "objects": [string], "filters": [string]},
    "forbiddenOutputs": [string],
    "acceptableFallbacks": [string]
  },
  "suggestedViewTypes": [string],
  "kpiHints": [{"label": string, "field": string, "aggregation": "count" | "sum" | "avg" | "min" | "max" | "latest"}]
}

RULES:
1. "name": Keep under 6 words. Descriptive, not generic. Example: "Engineering Sprint Health" not "Dashboard"
2. "purpose": One sentence describing what the tool shows and why. Start with an action verb.
3. "toolDescription": 2-3 sentences explaining in plain language what data this tool pulls, how it's organized, and what insights it provides. Written for a non-technical end user.
4. "goal_plan.kind":
   - DATA_RETRIEVAL: Simple fetching of records (list my repos, show tasks)
   - ANALYSIS: Aggregation, comparison, health scores, risk assessment
   - TRANSFORMATION: Data reshaping, cross-source joins, derived metrics
   - PLANNING: Actionable recommendations, prioritization, scheduling
5. "goal_plan.sub_goals": Break complex requests into 2-4 concrete sub-goals
6. "goal_plan.constraints": Business constraints (time ranges, filters, priorities)
7. "intent_contract.successCriteria": How we measure if the tool answered the question (3-5 criteria)
8. "intent_contract.implicitConstraints": What the user didn't say but expects (recency, relevance, permissions)
9. "intent_contract.timeHorizon": When "recent" or "last week" implied, set explicit window
10. "intent_contract.requiredEntities.integrations": Which integrations from [${connectedList}] are needed
11. "intent_contract.requiredEntities.objects": Data objects needed (e.g., "issues", "pull_requests", "conversations")
12. "suggestedViewTypes": Best view types for this data: "table", "kanban", "timeline", "dashboard"
13. "kpiHints": Key metrics to extract from the data (e.g., {"label": "Open Issues", "field": "status", "aggregation": "count"})
14. "intent_contract.subjectivityScore": 0.0 = purely objective (list repos), 1.0 = highly subjective (assess health)

EXAMPLES:
- "Show me open issues in Linear" → kind: DATA_RETRIEVAL, simple table, kpiHints: [{label: "Total", field: "*", aggregation: "count"}]
- "Monitor compliance across all repos" → kind: ANALYSIS, dashboard+table, kpiHints for coverage%, violations, risk score
- "Track customer health scores" → kind: ANALYSIS, dashboard+kanban, kpiHints for health score, churn risk, NPS
- "Build a weekly sprint summary" → kind: PLANNING, dashboard+timeline, kpiHints for velocity, completion rate, blockers`,
      },
      { role: "user", content: ctx.prompt },
    ],
    temperature: 0,
    max_tokens: 800,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (content) {
    console.log("[ToolCompilerLLMOutput]", { stage: "understand-purpose", content });
  }
  if (!content) {
    return { specPatch: buildFallbackPatch(ctx.prompt) };
  }
  try {
    const json = JSON.parse(content);
    return { specPatch: buildSpecPatchFromAnalysis(json, ctx.prompt) };
  } catch {
    return { specPatch: buildFallbackPatch(ctx.prompt) };
  }
}

function buildSpecPatchFromAnalysis(json: any, prompt: string): Record<string, any> {
  const name = typeof json.name === "string" && json.name.trim().length > 0
    ? json.name.trim()
    : "Tool";

  const purpose = typeof json.purpose === "string" && json.purpose.trim().length > 0
    ? json.purpose.trim()
    : prompt;

  const toolDescription = typeof json.toolDescription === "string" && json.toolDescription.trim().length > 0
    ? json.toolDescription.trim()
    : purpose;

  const patch: Record<string, any> = { name, purpose, toolDescription };

  // Goal plan
  if (json.goal_plan && typeof json.goal_plan === "object") {
    const gp = json.goal_plan;
    patch.goal_plan = {
      kind: ["DATA_RETRIEVAL", "TRANSFORMATION", "PLANNING", "ANALYSIS"].includes(gp.kind) ? gp.kind : "DATA_RETRIEVAL",
      primary_goal: typeof gp.primary_goal === "string" ? gp.primary_goal : prompt,
      sub_goals: Array.isArray(gp.sub_goals) ? gp.sub_goals.filter((s: any) => typeof s === "string") : [],
      constraints: Array.isArray(gp.constraints) ? gp.constraints.filter((s: any) => typeof s === "string") : [],
      derived_entities: Array.isArray(gp.derived_entities) ? gp.derived_entities.filter(
        (e: any) => e && typeof e.name === "string" && typeof e.description === "string",
      ) : [],
    };
  }

  // Intent contract
  if (json.intent_contract && typeof json.intent_contract === "object") {
    const ic = json.intent_contract;
    patch.intent_contract = {
      userGoal: typeof ic.userGoal === "string" ? ic.userGoal : prompt,
      successCriteria: Array.isArray(ic.successCriteria) ? ic.successCriteria.filter((s: any) => typeof s === "string") : [],
      implicitConstraints: Array.isArray(ic.implicitConstraints) ? ic.implicitConstraints.filter((s: any) => typeof s === "string") : [],
      hiddenStateRequirements: Array.isArray(ic.hiddenStateRequirements) ? ic.hiddenStateRequirements.filter((s: any) => typeof s === "string") : [],
      timeHorizon: ic.timeHorizon && typeof ic.timeHorizon.window === "string" ? ic.timeHorizon : undefined,
      subjectivityScore: typeof ic.subjectivityScore === "number" ? Math.min(1, Math.max(0, ic.subjectivityScore)) : 0.5,
      heuristics: [],
      requiredEntities: {
        integrations: Array.isArray(ic.requiredEntities?.integrations) ? ic.requiredEntities.integrations : [],
        objects: Array.isArray(ic.requiredEntities?.objects) ? ic.requiredEntities.objects : [],
        filters: Array.isArray(ic.requiredEntities?.filters) ? ic.requiredEntities.filters : [],
      },
      forbiddenOutputs: Array.isArray(ic.forbiddenOutputs) ? ic.forbiddenOutputs : [],
      acceptableFallbacks: Array.isArray(ic.acceptableFallbacks) ? ic.acceptableFallbacks : [],
    };
  }

  // Suggested view types for downstream design-views stage
  if (Array.isArray(json.suggestedViewTypes)) {
    patch._suggestedViewTypes = json.suggestedViewTypes.filter((s: any) => typeof s === "string");
  }

  // KPI hints for downstream data insights extraction
  if (Array.isArray(json.kpiHints)) {
    patch._kpiHints = json.kpiHints.filter(
      (k: any) => k && typeof k.label === "string" && typeof k.field === "string",
    );
  }

  return patch;
}

function buildFallbackPatch(prompt: string): Record<string, any> {
  return {
    name: "Tool",
    purpose: prompt,
    toolDescription: prompt,
    goal_plan: {
      kind: "DATA_RETRIEVAL" as const,
      primary_goal: prompt,
      sub_goals: [],
      constraints: [],
      derived_entities: [],
    },
    intent_contract: {
      userGoal: prompt,
      successCriteria: ["Return relevant data matching the request"],
      implicitConstraints: ["Prefer recent data", "Respect integration permissions"],
      hiddenStateRequirements: [],
      subjectivityScore: 0.3,
      heuristics: [],
      requiredEntities: { integrations: [], objects: [], filters: [] },
      forbiddenOutputs: [],
      acceptableFallbacks: ["Show available data with best-effort matching"],
    },
  };
}
