import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getCapabilitiesForIntegration, getCapability } from "@/lib/capabilities/registry";
import { ActionSpec, IntegrationId, IntegrationIdSchema } from "@/lib/toolos/spec";
import type { ToolCompilerStageContext, ToolCompilerStageResult } from "@/lib/toolos/compiler/tool-compiler";

export async function runDefineActions(
  ctx: ToolCompilerStageContext,
): Promise<ToolCompilerStageResult> {
  const integrations = ctx.spec.integrations.map((i) => i.id);
  const capabilityCatalog = integrations
    .map((id) => `${id}: ${getCapabilitiesForIntegration(id).map((c) => c.id).join(", ")}`)
    .join("\n");
  const response = await azureOpenAIClient.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    messages: [
      {
        role: "system",
        content:
          `Return JSON: {"actions":[{"id":string,"name":string,"description":string,"integrationId":string,"capabilityId":string,"inputSchema":object,"outputSchema":object}]}.
Only use capabilities from:\n${capabilityCatalog}`,
      },
      { role: "user", content: ctx.prompt },
    ],
    temperature: 0,
    max_tokens: 500,
    response_format: { type: "json_object" },
  });
  await ctx.onUsage?.(response.usage);
  const content = response.choices[0]?.message?.content;
  if (!content) return { specPatch: { actions: buildFallbackActions(integrations) } };
  try {
    const json = JSON.parse(content);
    const actions: ActionSpec[] = Array.isArray(json.actions)
      ? json.actions.flatMap((action: any) => {
          if (!action || typeof action !== "object") return [];
          if (typeof action.integrationId !== "string" || typeof action.capabilityId !== "string") return [];
          const integrationId = IntegrationIdSchema.safeParse(action.integrationId);
          if (!integrationId.success) return [];
          const cap = getCapability(action.capabilityId);
          if (!cap || cap.integrationId !== integrationId.data) return [];
          const name = typeof action.name === "string" && action.name.trim().length > 0 ? action.name.trim() : "Action";
          const description =
            typeof action.description === "string" && action.description.trim().length > 0
              ? action.description.trim()
              : name;
          const id =
            typeof action.id === "string" && action.id.trim().length > 0
              ? action.id.trim()
              : `${integrationId.data}.${action.capabilityId}`;
          const inputSchema =
            action.inputSchema && typeof action.inputSchema === "object" ? action.inputSchema : {};
          const outputSchema =
            action.outputSchema && typeof action.outputSchema === "object" ? action.outputSchema : {};
          const allowedOperations = cap.allowedOperations ?? [];
          const isRead = allowedOperations.includes("read");
          const safeAction: ActionSpec = {
            id,
            name,
            description,
            type: isRead ? "READ" : "WRITE",
            integrationId: integrationId.data,
            capabilityId: action.capabilityId,
            inputSchema,
            outputSchema,
            writesToState: !isRead,
          };
          return [safeAction];
        })
      : [];
    if (actions.length === 0) {
      return { specPatch: { actions: buildFallbackActions(integrations) } };
    }
    return { specPatch: { actions } };
  } catch {
    return { specPatch: { actions: buildFallbackActions(integrations) } };
  }
}

function buildFallbackActions(integrations: IntegrationId[]): ActionSpec[] {
  return integrations.map((integration) => {
    if (integration === "google") {
      return {
        id: "google.listEmails",
        name: "List emails",
        description: "List recent Gmail emails",
        type: "READ",
        integrationId: "google",
        capabilityId: "google_gmail_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
      };
    }
    if (integration === "github") {
      return {
        id: "github.listRepos",
        name: "List repositories",
        description: "List GitHub repositories",
        type: "READ",
        integrationId: "github",
        capabilityId: "github_repos_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
      };
    }
    if (integration === "linear") {
      return {
        id: "linear.listIssues",
        name: "List issues",
        description: "List Linear issues",
        type: "READ",
        integrationId: "linear",
        capabilityId: "linear_issues_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
      };
    }
    if (integration === "slack") {
      return {
        id: "slack.listMessages",
        name: "List messages",
        description: "List Slack messages",
        type: "READ",
        integrationId: "slack",
        capabilityId: "slack_messages_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
      };
    }
    return {
      id: "notion.listPages",
      name: "List pages",
      description: "List Notion pages",
      type: "READ",
      integrationId: "notion",
      capabilityId: "notion_pages_search",
      inputSchema: {},
      outputSchema: {},
      writesToState: false,
    };
  });
}
