import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

/** Maximum entities to extract per tool */
const MAX_ENTITIES = 5;

/** Common field templates for well-known entity types */
const ENTITY_FIELD_TEMPLATES: Record<string, Array<{ name: string; type: string; required?: boolean }>> = {
  Issue: [
    { name: "title", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "priority", type: "string" },
    { name: "assignee", type: "string" },
    { name: "labels", type: "string" },
    { name: "created", type: "datetime" },
    { name: "updated", type: "datetime" },
  ],
  PullRequest: [
    { name: "title", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "author", type: "string" },
    { name: "reviewers", type: "string" },
    { name: "repository", type: "string" },
    { name: "created", type: "datetime" },
    { name: "merged", type: "datetime" },
  ],
  Repo: [
    { name: "name", type: "string", required: true },
    { name: "owner", type: "string" },
    { name: "description", type: "string" },
    { name: "language", type: "string" },
    { name: "stars", type: "number" },
    { name: "updated", type: "datetime" },
  ],
  Conversation: [
    { name: "subject", type: "string", required: true },
    { name: "state", type: "string" },
    { name: "assignee", type: "string" },
    { name: "customer", type: "string" },
    { name: "priority", type: "string" },
    { name: "created", type: "datetime" },
  ],
  Task: [
    { name: "title", type: "string", required: true },
    { name: "status", type: "string", required: true },
    { name: "assignee", type: "string" },
    { name: "priority", type: "string" },
    { name: "dueDate", type: "datetime" },
    { name: "project", type: "string" },
  ],
  Page: [
    { name: "title", type: "string", required: true },
    { name: "lastEdited", type: "datetime" },
    { name: "createdBy", type: "string" },
    { name: "parent", type: "string" },
    { name: "status", type: "string" },
  ],
  Email: [
    { name: "subject", type: "string", required: true },
    { name: "from", type: "string", required: true },
    { name: "date", type: "datetime" },
    { name: "snippet", type: "string" },
    { name: "isRead", type: "boolean" },
  ],
  Meeting: [
    { name: "topic", type: "string", required: true },
    { name: "startTime", type: "datetime" },
    { name: "duration", type: "number" },
    { name: "organizer", type: "string" },
    { name: "joinUrl", type: "string" },
  ],
  Contact: [
    { name: "name", type: "string", required: true },
    { name: "email", type: "string" },
    { name: "company", type: "string" },
    { name: "phone", type: "string" },
    { name: "lastContact", type: "datetime" },
  ],
  Deal: [
    { name: "name", type: "string", required: true },
    { name: "stage", type: "string", required: true },
    { name: "amount", type: "currency" },
    { name: "closeDate", type: "datetime" },
    { name: "owner", type: "string" },
    { name: "company", type: "string" },
  ],
  Commit: [
    { name: "sha", type: "string", required: true },
    { name: "message", type: "string", required: true },
    { name: "author", type: "string" },
    { name: "date", type: "datetime" },
    { name: "repository", type: "string" },
  ],
  Event: [
    { name: "type", type: "string", required: true },
    { name: "actor", type: "string" },
    { name: "repo", type: "string" },
    { name: "created", type: "datetime" },
    { name: "payload", type: "string" },
  ],
  Channel: [
    { name: "name", type: "string", required: true },
    { name: "topic", type: "string" },
    { name: "purpose", type: "string" },
    { name: "memberCount", type: "number" },
    { name: "created", type: "datetime" },
  ],
  Company: [
    { name: "name", type: "string", required: true },
    { name: "domain", type: "string" },
    { name: "industry", type: "string" },
    { name: "size", type: "string" },
    { name: "owner", type: "string" },
    { name: "created", type: "datetime" },
  ],
};

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
          fields: ENTITY_FIELD_TEMPLATES.Repo!,
        }],
      },
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
          fields: ENTITY_FIELD_TEMPLATES.Issue!,
        }],
      },
    };
  }

  const integrations = Array.from(
    new Set(ctx.spec.integrations.map((i) => i.id)),
  );

  // Leverage goal_plan and intent_contract from understand-purpose for better context
  const goalContext = ctx.spec.goal_plan
    ? `\nGoal: ${ctx.spec.goal_plan.primary_goal}\nSub-goals: ${ctx.spec.goal_plan.sub_goals?.join(", ") || "none"}\nGoal kind: ${ctx.spec.goal_plan.kind}`
    : "";

  const intentContext = ctx.spec.intent_contract
    ? `\nRequired objects: ${ctx.spec.intent_contract.requiredEntities?.objects?.join(", ") || "auto-detect"}`
    : "";

  const response = await getAzureOpenAIClient().chat.completions.create({
    model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `You extract data entities from a user's tool request. Return JSON: {"entities":[{"name":string,"fields":[{"name":string,"type":"string"|"number"|"boolean"|"datetime"|"currency"|"url"|"email","required":boolean,"displayName":string}],"sourceIntegration":string,"identifiers":string[],"supportedActions":string[],"relations":[]}]}.

CRITICAL RULES:
- Generate ONLY entities that DIRECTLY answer the user's question. Do NOT generate one entity per integration.
- Maximum ${MAX_ENTITIES} entities total. Fewer is better — only include what's needed.
- Each entity must map to a specific data type the user asked about (e.g. "Issues", "PRs", "Emails")
- If the prompt is abstract (e.g. "monitor compliance"), identify the 1-3 concrete data types needed
- Do NOT create generic placeholder entities. Every entity must have a clear purpose.
- Only use integrations from: ${integrations.join(", ") || "github, linear, notion"}

FIELD REQUIREMENTS:
- Include 4-7 meaningful fields per entity (not just id)
- Each field needs a "displayName" — a human-readable label (e.g. "assignee" → "Assigned To", "created_at" → "Created Date")
- Use accurate field types: "datetime" for dates, "currency" for money, "url" for links, "email" for emails
- Always include: a primary identifier field, a status/state field (if applicable), and a date field
- Fields should match what the API actually returns (e.g. GitHub issues have title, state, assignee, labels, created_at)

ENTITY NAMING:
- Use singular PascalCase: "Issue" not "issues", "PullRequest" not "pull_requests"
- Use domain-specific names: "Conversation" (Intercom), "Task" (Asana), "Page" (Notion), "Deal" (HubSpot)`,
      },
      {
        role: "user",
        content: ctx.prompt + goalContext + intentContext,
      },
    ],
    temperature: 0,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (content) {
    console.log("[ToolCompilerLLMOutput]", { stage: "extract-entities", content });
  }
  if (!content) return { specPatch: { entities: [] } };
  try {
    const json = JSON.parse(content);
    const entities = Array.isArray(json.entities)
      ? json.entities
          .filter((entity: any) => entity && typeof entity.name === "string")
          .map((entity: any) => enrichEntityFields(entity))
          .slice(0, MAX_ENTITIES)
      : [];
    return { specPatch: { entities } };
  } catch {
    return { specPatch: { entities: [] } };
  }
}

/** Enrich entity fields with templates and ensure displayName */
function enrichEntityFields(entity: any): any {
  if (!entity || !entity.name) return entity;

  // If entity has no fields or very few, try to fill from template
  const template = ENTITY_FIELD_TEMPLATES[entity.name];
  if (template && (!Array.isArray(entity.fields) || entity.fields.length < 3)) {
    entity.fields = template;
  }

  // Ensure every field has a displayName
  if (Array.isArray(entity.fields)) {
    entity.fields = entity.fields.map((field: any) => {
      if (!field.displayName) {
        field.displayName = humanizeFieldName(field.name);
      }
      return field;
    });
  }

  return entity;
}

/** Convert camelCase/snake_case field names to human-readable labels */
function humanizeFieldName(name: string): string {
  const DISPLAY_MAP: Record<string, string> = {
    id: "ID",
    url: "URL",
    html_url: "Link",
    web_url: "Link",
    created_at: "Created",
    updated_at: "Updated",
    closed_at: "Closed",
    merged_at: "Merged",
    due_on: "Due Date",
    due_date: "Due Date",
    dueDate: "Due Date",
    startTime: "Start Time",
    start_time: "Start Time",
    joinUrl: "Join URL",
    join_url: "Join URL",
    fullName: "Full Name",
    full_name: "Full Name",
    firstName: "First Name",
    lastName: "Last Name",
    lastEdited: "Last Edited",
    lastContact: "Last Contact",
    isRead: "Read Status",
    closeDate: "Close Date",
    pr: "Pull Request",
    repo: "Repository",
    sha: "Commit SHA",
    assignee: "Assigned To",
    reviewers: "Reviewers",
    bodyPreview: "Preview",
  };
  if (DISPLAY_MAP[name]) return DISPLAY_MAP[name];

  // Split camelCase and snake_case
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
