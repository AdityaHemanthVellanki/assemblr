import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";
import { getCapabilitiesForIntegration } from "@/lib/capabilities/registry";
import { IntegrationId, IntegrationIdSchema } from "@/lib/toolos/spec";
import { detectIntegrationsFromText } from "@/lib/integrations/detection";
import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";

/** Maximum integrations to resolve for any single tool */
const MAX_INTEGRATIONS = 4;

export async function runResolveIntegrations(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const connectedSet = new Set(ctx.connectedIntegrationIds);
  const detected = new Set<IntegrationId>();

  // 1. Semantic detection from the user prompt
  for (const id of detectIntegrationsFromText(ctx.prompt)) {
    detected.add(id);
  }

  // 2. Also pull integration IDs from already-extracted entities
  for (const entity of ctx.spec.entities) {
    const parsed = IntegrationIdSchema.safeParse(entity.sourceIntegration);
    if (parsed.success) {
      detected.add(parsed.data);
    }
  }

  // 3. Filter detected integrations to only those that are ACTUALLY connected.
  // This prevents the pipeline from selecting integrations via NLP keywords
  // that will just be silently stripped later at the readiness check.
  if (detected.size > 0 && connectedSet.size > 0) {
    const disconnected = [...detected].filter(id => !connectedSet.has(id));
    if (disconnected.length > 0) {
      console.log(`[ResolveIntegrations] Filtering out disconnected integrations: ${disconnected.join(", ")}. Connected: ${[...connectedSet].join(", ")}`);
      for (const id of disconnected) {
        detected.delete(id);
      }
    }
  }

  let ids = Array.from(detected);

  // 4. When keyword detection found nothing (or all were disconnected),
  // use LLM to score relevance among CONNECTED integrations only.
  if (ids.length === 0 && ctx.connectedIntegrationIds.length > 0) {
    const validConnected = ctx.connectedIntegrationIds
      .map((id) => IntegrationIdSchema.safeParse(id))
      .filter((result) => result.success)
      .map((result) => result.data);

    if (validConnected.length > 0) {
      ids = await scoreIntegrationRelevance(ctx.prompt, validConnected, ctx.onUsage);
    }
  }

  // 5. Last resort: pick from connected integrations, or fallback defaults
  if (ids.length === 0) {
    // Prefer connected integrations over hardcoded defaults
    const connectedFallback = ctx.connectedIntegrationIds
      .map((id) => IntegrationIdSchema.safeParse(id))
      .filter((result) => result.success)
      .map((result) => result.data)
      .slice(0, 2);
    ids = connectedFallback.length > 0 ? connectedFallback : ["github", "linear"];
  }

  // 5. Hard cap — never resolve more than MAX_INTEGRATIONS
  if (ids.length > MAX_INTEGRATIONS) {
    ids = ids.slice(0, MAX_INTEGRATIONS);
  }

  const integrations = ids.map((id) => ({
    id,
    capabilities: getCapabilitiesForIntegration(id).map((c) => c.id),
  }));
  return { specPatch: { integrations } };
}

/**
 * Use a fast LLM call to pick the 1-4 most relevant integrations for a prompt.
 * Returns only integrations that score above a confidence threshold.
 */
async function scoreIntegrationRelevance(
  prompt: string,
  available: IntegrationId[],
  onUsage?: (usage?: { total_tokens?: number }) => Promise<void> | void,
): Promise<IntegrationId[]> {
  const INTEGRATION_DESCRIPTIONS: Record<string, string> = {
    github: "Code repos, issues, pull requests, commits, CI/CD",
    linear: "Project management, sprints, issues, cycles, roadmaps",
    slack: "Team messaging, channels, notifications",
    notion: "Docs, wikis, knowledge base, databases, pages",
    google: "Gmail, Google Sheets, Google Drive, Google Calendar",
    trello: "Kanban boards, cards, task lists",
    airtable: "Spreadsheet databases, bases, records",
    intercom: "Customer support conversations, contacts, companies",
    zoom: "Video meetings, recordings, webinars",
    gitlab: "Code repos, merge requests, pipelines, CI/CD",
    bitbucket: "Code repos, pull requests, workspaces",
    asana: "Task management, projects, workspaces",
    microsoft_teams: "Team chat, channels, meetings",
    outlook: "Email, calendar events, contacts",
    stripe: "Payments, customers, subscriptions, invoices, billing",
    hubspot: "CRM, contacts, deals, sales pipeline, companies",
    discord: "Community servers, guilds, channels",
    clickup: "Task management, spaces, lists",
    quickbooks: "Accounting, invoices, expenses, customers",
    google_analytics: "Web traffic, sessions, page views, audiences",
    salesforce: "CRM, leads, opportunities, accounts",
    zendesk: "Support tickets, help desk",
    jira: "Issue tracking, sprints, projects",
  };

  const catalog = available
    .map((id) => `- ${id}: ${INTEGRATION_DESCRIPTIONS[id] ?? id}`)
    .join("\n");

  try {
    const response = await getAzureOpenAIClient().chat.completions.create({
      model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        {
          role: "system",
          content: `You are an integration relevance scorer. Given a user's request, select ONLY the integrations that are directly relevant to fulfilling it.

Rules:
- Select 1-${MAX_INTEGRATIONS} integrations maximum
- Only select integrations that would contain data needed to answer the request
- If the request is vague or abstract (e.g. "monitor compliance"), pick the 2-3 integrations most likely to have actionable data
- Do NOT select all integrations — be selective and precise
- Return JSON: {"integrations":["integration_id_1","integration_id_2"]}

Available integrations:
${catalog}`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 150,
      response_format: { type: "json_object" },
    });
    await onUsage?.(response.usage);

    const content = response.choices[0]?.message?.content;
    if (!content) return available.slice(0, 2);

    const json = JSON.parse(content);
    const selected = Array.isArray(json.integrations)
      ? json.integrations
          .filter((id: any) => typeof id === "string" && available.includes(id as IntegrationId))
          .slice(0, MAX_INTEGRATIONS) as IntegrationId[]
      : [];

    if (selected.length === 0) return available.slice(0, 2);
    return selected;
  } catch (err) {
    console.warn("[ResolveIntegrations] LLM relevance scoring failed, using top 2 connected:", err);
    return available.slice(0, 2);
  }
}
