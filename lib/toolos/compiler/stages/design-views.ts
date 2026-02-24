import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { ViewSpec } from "@/lib/toolos/spec";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

/** Maximum views to generate per tool */
const MAX_VIEWS = 4;

/** View type selection guidance based on data characteristics */
const VIEW_TYPE_GUIDANCE: Record<string, string> = {
  table: "Best for lists of records with multiple columns. Use when data is flat and users need to search/sort/filter.",
  kanban: "Best for status-driven workflows (issues, tasks, deals). Groups items into columns by a status/stage field.",
  timeline: "Best for chronological data (events, commits, activity logs). Shows items on a time axis.",
  dashboard: "Best for high-level overviews with KPIs, metrics, and summary charts. Use for monitoring/analysis prompts.",
  detail: "Best for single-record deep inspection. Use when each item has rich nested data.",
  inspector: "Best for debugging or audit views. Shows raw data with expandable sections.",
};

export async function runDesignViews(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  if (ctx.spec.entities.length === 0) {
    throw new Error("View spec required but no entities found");
  }

  // Only pass entities that have corresponding actions (avoid orphan views)
  const actionIntegrations = new Set(ctx.spec.actions.map((a) => a.integrationId));
  const relevantEntities = ctx.spec.entities.filter((e) => actionIntegrations.has(e.sourceIntegration));
  const entitiesToUse = relevantEntities.length > 0 ? relevantEntities : ctx.spec.entities;

  // Leverage suggested view types from understand-purpose stage
  const suggestedTypes = (ctx.spec as any)._suggestedViewTypes as string[] | undefined;
  const typeHint = suggestedTypes?.length
    ? `\nPreferred view types (from intent analysis): ${suggestedTypes.join(", ")}`
    : "";

  // Leverage goal kind for view type selection
  const goalKind = ctx.spec.goal_plan?.kind;
  const goalHint = goalKind
    ? `\nGoal type: ${goalKind} — ${getGoalViewGuidance(goalKind)}`
    : "";

  // Build entity descriptions with field display names
  const entityDescriptions = entitiesToUse.map((e) => ({
    name: e.name,
    sourceIntegration: e.sourceIntegration,
    fields: e.fields.map((f: any) => ({
      name: f.name,
      displayName: f.displayName || humanizeFieldName(f.name),
      type: f.type || "string",
    })),
  }));

  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `You design data views for a user's tool. Return JSON: {"views":[{"id":string,"name":string,"type":"table"|"kanban"|"timeline"|"dashboard"|"detail"|"inspector","source":{"entity":string,"statePath":string},"fields":string[],"actions":string[]}]}.

RULES:
- Generate 1-${MAX_VIEWS} views maximum. Quality over quantity.
- Each view must directly help answer the user's request
- Do NOT create one view per entity — combine related data or pick the most important entities
- For statePath, use format: "integrationId.entityNamePlural" (e.g. "github.issues")
- Only reference entities: ${entitiesToUse.map((e) => e.name).join(", ")}
- Only reference actions: ${ctx.spec.actions.map((a) => a.id).join(", ") || "none"}

VIEW TYPE SELECTION:
${Object.entries(VIEW_TYPE_GUIDANCE).map(([k, v]) => `- "${k}": ${v}`).join("\n")}

FIELD SELECTION:
- Include 4-7 fields per view (not too few, not too many)
- Lead with the most important/identifiable field (title, name, subject)
- Include a status/state field if available
- Include a date field for temporal context
- Omit internal IDs and technical fields (id, _id, node_id)
- Use the field names from the entity definition, not invented ones
${typeHint}${goalHint}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt: ctx.prompt,
          entities: entityDescriptions,
          actions: ctx.spec.actions.map((a) => ({ id: a.id, name: a.name, type: a.type, integrationId: a.integrationId })),
        }),
      },
    ],
    temperature: 0,
    max_tokens: 800,
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
    // Validate that views reference existing entities
    const entityNames = new Set(entitiesToUse.map((e) => e.name));
    const validViews = rawViews.filter((v: ViewSpec) =>
      v && v.source?.entity && entityNames.has(v.source.entity),
    );
    const capped = validViews.slice(0, MAX_VIEWS);
    if (capped.length === 0) {
      throw new Error("View spec required but none matched entities");
    }
    const normalized = normalizeViewFields(ctx, capped);
    return { specPatch: { views: normalized } };
  } catch (e: any) {
    if (e.message?.includes("View spec required")) throw e;
    throw new Error("View spec required but invalid JSON");
  }
}

function getGoalViewGuidance(kind: string): string {
  switch (kind) {
    case "ANALYSIS":
      return "Prefer dashboard view for KPIs + table for detail drill-down";
    case "PLANNING":
      return "Prefer kanban for workflow stages or timeline for scheduling";
    case "TRANSFORMATION":
      return "Prefer table for transformed data with computed fields";
    case "DATA_RETRIEVAL":
    default:
      return "Prefer table for raw data lists, kanban if status-driven";
  }
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
      // Select best fields: prioritize required fields, then status, then dates
      const prioritized = prioritizeFields(availableFields, ctx.spec.entities.find((e) => e.name === view.source.entity));
      return { ...view, fields: prioritized.slice(0, 7) };
    }
    // Ensure we don't have too many fields (keep it readable)
    if (view.fields.length > 8) {
      return { ...view, fields: view.fields.slice(0, 7) };
    }
    return view;
  });
}

/** Prioritize fields for display: required first, then status, dates, others */
function prioritizeFields(fields: string[], entity?: any): string[] {
  if (!entity?.fields || !Array.isArray(entity.fields)) return fields;

  const fieldMeta = new Map<string, any>(entity.fields.map((f: any) => [f.name, f]));
  const sorted = [...fields].sort((a, b) => {
    const metaA = fieldMeta.get(a) as any;
    const metaB = fieldMeta.get(b) as any;

    // Required fields first
    if (metaA?.required && !metaB?.required) return -1;
    if (!metaA?.required && metaB?.required) return 1;

    // Status/state fields next
    const aIsStatus = a.toLowerCase().includes("status") || a.toLowerCase().includes("state") || a.toLowerCase().includes("priority");
    const bIsStatus = b.toLowerCase().includes("status") || b.toLowerCase().includes("state") || b.toLowerCase().includes("priority");
    if (aIsStatus && !bIsStatus) return -1;
    if (!aIsStatus && bIsStatus) return 1;

    // Date fields next
    const aIsDate = metaA?.type === "datetime" || a.toLowerCase().includes("date") || a.toLowerCase().includes("time");
    const bIsDate = metaB?.type === "datetime" || b.toLowerCase().includes("date") || b.toLowerCase().includes("time");
    if (aIsDate && !bIsDate) return -1;
    if (!aIsDate && bIsDate) return 1;

    // Internal IDs last
    const aIsId = a === "id" || a.endsWith("Id") || a.endsWith("_id");
    const bIsId = b === "id" || b.endsWith("Id") || b.endsWith("_id");
    if (aIsId && !bIsId) return 1;
    if (!aIsId && bIsId) return -1;

    return 0;
  });

  // Filter out pure internal IDs
  return sorted.filter((f) => f !== "id" && f !== "_id" && f !== "node_id");
}

function humanizeFieldName(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
