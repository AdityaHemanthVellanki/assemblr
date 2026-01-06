import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { dashboardSpecSchema, type DashboardSpec } from "@/lib/spec/dashboardSpec";
import { planChatResponse } from "./chat-planner";
import { resolveIntegrations } from "@/lib/integrations/resolveIntegrations";
import { INTEGRATIONS, type Capability } from "@/lib/integrations/capabilities";
import { getIntegrationUIConfig } from "@/lib/integrations/registry";
import type { Json } from "@/lib/supabase/database.types";

import { getDiscoveredSchemas, persistSchema } from "@/lib/schema/store";
import { inferSchemaFromData } from "@/lib/schema/discovery";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";
import { GitHubExecutor } from "@/lib/integrations/executors/github";
import { LinearExecutor } from "@/lib/integrations/executors/linear";
import { SlackExecutor } from "@/lib/integrations/executors/slack";
import { NotionExecutor } from "@/lib/integrations/executors/notion";
import { GoogleExecutor } from "@/lib/integrations/executors/google";
import { IntegrationExecutor, ExecutionResult } from "@/lib/execution/types";
import { executeDashboard } from "@/lib/execution/engine";

const EXECUTORS: Record<string, IntegrationExecutor> = {
  github: new GitHubExecutor(),
  linear: new LinearExecutor(),
  slack: new SlackExecutor(),
  notion: new NotionExecutor(),
  google: new GoogleExecutor(),
};

// --- Schema Definitions ---

const CORE_SPEC_INSTRUCTIONS = `
The "spec" object must strictly follow this schema:
{
  "title": string,
  "description"?: string,
  "metrics": Array<{
    "id": string,
    "label": string,
    "type": "count" | "sum",
    "table": string,
    "field"?: string,
    "groupBy"?: "day"
  }>,
  "views": Array<{
    "id": string,
    "type": "metric" | "line_chart" | "bar_chart" | "table",
    "metricId"?: string,
    "table"?: string,
    "integrationId"?: string
  }>
}

Metric rules:
- count: counts rows. No field.
- sum: sums field. Field required.
- groupBy: "day" or omitted.
- table: MUST be one of the resources listed in "Available Schemas".
- integrationId: MUST be the integration ID providing the table.

View rules:
- metric, line_chart, bar_chart: require metricId.
- table: requires table. No metricId.
- integrationId: MUST match the integration ID for the table.
- Every metric.id and view.id must be unique.
- Non-table views must reference existing metricIds.
`;

const SYSTEM_PROMPT = `
You are Assemblr AI, an expert product engineer building internal tools.
Your goal is to help the user build and modify a dashboard tool.

CRITICAL:
- If the user asks a question (e.g., "Show me latest commits"), just answer it using the provided data.
- Do NOT mention dashboards, tables, schemas, fields, or "connecting schemas" in your explanation unless the user EXPLICITLY asked to modify the dashboard (e.g., "Save this", "Create a chart").
- If you are just showing data, keep it simple. "Here are the commits..."

If the user asks to connect an integration, do not explain how. The system will show connection controls.

You will receive:
1. The current tool specification (if any).
2. A history of the conversation.
3. The user's latest message.

You must output a JSON object with the following structure:
{
  "explanation": string,
  "spec": object
}

"explanation": A brief, helpful message to the user describing the changes you made, or answering their question.
"spec": The FULL, valid, updated dashboard specification. If no changes are needed, return the current spec exactly.

AVAILABLE SCHEMAS:
{{SCHEMAS}}

${CORE_SPEC_INSTRUCTIONS}

Conventions:
- Use readable titles and labels.
- Do NOT generate metrics or views unless you have confirmed an integration is connected.
- Use only integrations listed as connected: {{CONNECTED}}. Do not ask to connect any of these.
- Do NOT fabricate data.
- Prefer simple, effective dashboards.
- If you use an existing metric, mention that it might be cached.

STRICT RULES:
- Metrics define data sources (table, integrationId) and aggregation.
- Views NEVER include table or integrationId.
- Non-table views reference metrics ONLY via metricId.

VALID EXAMPLE:
{
  "title": "Engineering",
  "metrics": [
    { "id": "m1", "label": "Total Repos", "type": "count", "table": "repos", "integrationId": "github" }
  ],
  "views": [
    { "id": "v1", "type": "metric", "metricId": "m1" }
  ]
}

INVALID EXAMPLE (do NOT generate):
{
  "title": "Engineering",
  "metrics": [
    { "id": "m1", "label": "Total Repos", "type": "count", "table": "repos", "integrationId": "github" }
  ],
  "views": [
    { "id": "v1", "type": "metric", "metricId": "m1", "table": "repos", "integrationId": "github" }
  ]
}
`;

const chatResponseSchema = z.object({
  explanation: z.string(),
  spec: dashboardSpecSchema,
  metadata: z.object({
    missing_integration_id: z.string().optional(),
    action: z.enum(["connect_integration"]).optional(),
  }).optional(),
});

type LlmToolChatResponse = z.infer<typeof chatResponseSchema>;

export type IntegrationCTA = {
  id: string;
  name: string;
  logoUrl?: string;
  connected: boolean;
  label: string;
  action: string;
};

export type ToolChatMessage =
  | { type: "text"; content: string }
  | { type: "integration_action"; integrations: IntegrationCTA[] };

export type ToolChatResponse = {
  explanation: string;
  message: ToolChatMessage;
  spec: DashboardSpec;
  metadata?: Json | null;
};

// --- Helper: Spec Generation ---

async function generateSpecUpdate(input: {
  currentSpec: DashboardSpec;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  systemPrompt?: string;
}): Promise<LlmToolChatResponse> {
  const systemMessage = {
    role: "system" as const,
    content: (input.systemPrompt ?? SYSTEM_PROMPT) + `\n\nCurrent Spec: ${JSON.stringify(input.currentSpec)}`,
  };

  const history = input.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const lastMessage = {
    role: "user" as const,
    content: input.userMessage,
  };

  try {
    const response = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [systemMessage, ...history, lastMessage],
      temperature: 0.2,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("AI returned empty content");

    // Strict JSON validation
    if (!content.trim().startsWith("{")) {
       console.error("AI returned non-JSON response (parsed)", { content });
       throw new Error("AI returned non-JSON response");
    }

    try {
      const json = JSON.parse(content);
      if (json && json.spec && json.spec.views && Array.isArray(json.spec.views)) {
        json.spec.views = json.spec.views.map((v: any) => {
          if (v && (v.type === "metric" || v.type === "line_chart" || v.type === "bar_chart")) {
            const { table, integrationId, ...rest } = v;
            return rest;
          }
          return v;
        });
      }
      return chatResponseSchema.parse(json);
    } catch (err) {
      console.error("AI returned invalid response", { content, err });
      throw err;
    }
  } catch (err) {
    console.error("Azure OpenAI error", err);
    throw err;
  }
}

// --- Main Orchestrator ---

import { planExecution } from "./planner";
import { validatePlanAgainstCapabilities } from "@/lib/execution/validation";

import { findMetrics } from "@/lib/metrics/store";

import { ExecutionPlan } from "@/lib/ai/planner";

function resolveCapabilities(plan: ExecutionPlan): ExecutionPlan {
  // If it's an ad-hoc capability, ensure we have a valid resource
  if (plan.capabilityId.startsWith("ad_hoc_")) {
    // If resource is missing or undefined, try to infer from ID
    if (!plan.resource || plan.resource === "undefined") {
      const parts = plan.capabilityId.split("_");
      // e.g. ad_hoc_commits -> commits
      // e.g. ad_hoc_github_repos -> github_repos (might be wrong)
      // Usually ad_hoc_{resource}
      if (parts.length >= 3) {
         plan.resource = parts.slice(2).join("_");
      }
    }
  }
  return plan;
}

export async function processToolChat(input: {
  orgId: string;
  currentSpec: DashboardSpec;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  connectedIntegrationIds: string[];
  integrationMode: "auto" | "manual";
  selectedIntegrationIds?: string[];
}): Promise<ToolChatResponse> {
  getServerEnv();

  // 0. Fetch Discovered Schemas and Existing Metrics
  const schemasForPlanning = await getDiscoveredSchemas(input.orgId);
  const existingMetrics = await findMetrics(input.orgId);

  // 1. Run Capability Planner
  // We only run this if the user seems to be requesting data/modification
  // For now, run it for every message to be safe, or check intent.
  // The planner itself will decide if it can map intent.
  let executionPlans: any[] = [];
  try {
    const planResult = await planExecution(
      input.userMessage, 
      input.messages,
      input.connectedIntegrationIds, 
      schemasForPlanning,
      existingMetrics
    );

    // CRITICAL: If the planner gives an explanation without plans (e.g. asking for clarification), return immediately.
    // This prevents falling through to schema-dependent logic.
    if ((!planResult.plans || planResult.plans.length === 0) && (planResult.explanation || planResult.error)) {
        return {
            explanation: planResult.explanation || planResult.error || "I could not understand the request.",
            message: { type: "text", content: planResult.explanation || planResult.error || "Please clarify." },
            spec: input.currentSpec
        };
    }

    if (planResult.error) {
       console.warn("Planning error:", planResult.error);
       // If there are plans, we might proceed? No, usually error means failure.
       // But if we handled the explanation above, this might be a system error?
       // Let's assume if plans exist, we ignore error or log it.
    }
    
    if (planResult.plans) {
       executionPlans = planResult.plans.map(resolveCapabilities);
       
       // Validate Plans
       for (const p of executionPlans) {
         const val = validatePlanAgainstCapabilities(p);
         if (!val.valid) {
           console.warn(`Plan validation failed: ${val.error}`);
         }
       }
    }
  } catch (err) {
    console.warn("Planning step failed", err);
  }

  // 4. Handle Execution Plans (Execution-First Pipeline)
  const successfulExecutions: Array<{ plan: any; result: ExecutionResult }> = [];
  let executionError: string | undefined;
  let lastErrorIntegrationId: string | undefined;

  for (const plan of executionPlans) {
    // Check if schema exists for this resource (for inference purposes)
    const schemaExists = schemasForPlanning.some(
      s => s.integrationId === plan.integrationId && s.resource === plan.resource
    );
    
    // EXECUTE EVERYTHING. We need data to create views or answer questions.
    try {
      const executor = EXECUTORS[plan.integrationId];
      if (!executor) {
        console.warn(`No executor for ${plan.integrationId}`);
        continue;
      }

      const accessToken = await getValidAccessToken(input.orgId, plan.integrationId);
      const result = await executor.execute({
        plan: {
          viewId: "temp_exec_" + Date.now(),
          integrationId: plan.integrationId,
          resource: plan.resource,
          params: plan.params,
          // @ts-ignore - Pass intent for executor logic
          intent: plan.intent
        },
        credentials: { access_token: accessToken }
      });

      if (result.status === "success" && Array.isArray(result.rows)) {
         successfulExecutions.push({ plan, result });
      } else if (result.status === "error") {
         console.warn(`Execution failed for plan ${plan.capabilityId}: ${result.error}`);
         executionError = result.error;
         lastErrorIntegrationId = plan.integrationId;
      }
    } catch (err) {
      console.error("Ad-hoc execution failed", err);
      executionError = err instanceof Error ? err.message : "Unknown error";
      lastErrorIntegrationId = plan.integrationId;
    }
  }

  // Determine Overall Execution Mode
  // If ANY plan is "materialize" or "tool", we treat the whole request as materialized.
  // Otherwise, default to "ephemeral".
  const isMaterialize = successfulExecutions.some(
    e => e.plan.execution_mode === "materialize" || e.plan.execution_mode === "tool" || e.plan.intent === "persistent_view"
  );

  // --- BRANCH A: EPHEMERAL MODE ---
  if (!isMaterialize) {
      if (successfulExecutions.length > 0) {
          let content = "";
          let totalRows = 0;

          for (const { plan, result } of successfulExecutions) {
              const count = result.rows.length;
              totalRows += count;

              if (count > 0) {
                  // Specific Formatting for known resources
                  if (plan.resource === "commits") {
                      content += `### Latest commits in ${plan.params?.repo || "repo"}:\n\n`;
                      // Limit to 5 for chat readability
                      content += result.rows.slice(0, 5).map((row: any) => {
                          const msg = row.message?.split("\n")[0] || "No message";
                          const author = row.author?.name || row.author?.login || "Unknown";
                          const date = row.date ? new Date(row.date).toLocaleString() : "Unknown date";
                          const sha = row.sha ? row.sha.substring(0, 7) : "???";
                          return `- **${msg}**\n  - Author: ${author}\n  - Date: ${date}\n  - SHA: \`${sha}\``;
                      }).join("\n");
                      if (count > 5) content += `\n\n*(and ${count - 5} more)*`;
                      content += "\n\n";
                  } else if (plan.resource === "issues") {
                      content += `### Issues:\n\n`;
                      content += result.rows.slice(0, 5).map((row: any) => {
                          return `- **#${row.number} ${row.title}** (${row.state})`;
                      }).join("\n");
                      if (count > 5) content += `\n\n*(and ${count - 5} more)*`;
                      content += "\n\n";
                  } else {
                      // Generic Fallback
                       const firstRow = result.rows[0] as any;
                       if (firstRow?.count !== undefined && Object.keys(firstRow).length === 1) {
                           content += `**${plan.resource}**: ${firstRow.count}\n\n`;
                       } else {
                          content += `**${plan.resource}** (${count} items):\n`;
                          content += "```json\n" + JSON.stringify(result.rows.slice(0, 3), null, 2) + "\n```\n";
                          if (count > 3) content += `*(and ${count - 3} more)*\n`;
                          content += "\n";
                      }
                  }
              } else {
                  content += `**${plan.resource}**: No items found.\n\n`;
              }
          }
          
          // Only append the ephemeral footer if we actually showed data
          if (totalRows > 0) {
             content += "_This data is temporary. Ask 'Save this' to add it to your project._";
          }

          // TRUTHFULNESS CHECK:
          // If execution succeeded but returned no data, simply state that.
          const explanation = totalRows > 0 
            ? "Here are the results from your query:" 
            : "I executed the search but found no matching data.";

          return {
              explanation,
              message: { type: "text", content: content || explanation },
              spec: input.currentSpec,
              metadata: { 
                  source: "ephemeral",
                  data: successfulExecutions.map(e => ({ resource: e.plan.resource, rows: e.result.rows })) as Json
              }
          };
      } else if (executionError) {
          const msg = executionError.toLowerCase();
          const needsReconnect =
            msg.includes("integration is not connected") ||
            msg.includes("failed to decrypt") ||
            msg.includes("token refresh failed") ||
            msg.includes("missing credentials");
          
          if (needsReconnect && lastErrorIntegrationId) {
            const integrations = [{
              id: lastErrorIntegrationId,
              name: getIntegrationUIConfig(lastErrorIntegrationId).name,
              logoUrl: getIntegrationUIConfig(lastErrorIntegrationId).logoUrl,
              connected: input.connectedIntegrationIds.includes(lastErrorIntegrationId),
              label: `Reconnect ${getIntegrationUIConfig(lastErrorIntegrationId).name}`,
              action: `/api/oauth/start?${new URLSearchParams({ provider: lastErrorIntegrationId, source: "chat" }).toString()}`
            } satisfies IntegrationCTA];
            return {
              explanation: `Authentication for ${integrations[0].name} is invalid. Please reconnect.`,
              message: { type: "integration_action", integrations },
              spec: input.currentSpec,
              metadata: { type: "integration_action", integrations },
            };
          }
          
          return {
              explanation: `I couldn't fetch the data: ${executionError}`,
              message: { type: "text", content: "Execution failed." },
              spec: input.currentSpec
          };
      }
      // If no plans and no error, fall through (unlikely, planner usually gives plans or error)
  }

  // --- BRANCH B: MATERIALIZE MODE ---
  // If we are here, we are persisting schemas and updating the spec.
  
  // 1. Infer & Persist Schemas
  for (const { plan, result } of successfulExecutions) {
      const schemaExists = schemasForPlanning.some(
          s => s.integrationId === plan.integrationId && s.resource === plan.resource
      );
      
      if (!schemaExists && result.rows.length > 0) {
          try {
            const discovered = inferSchemaFromData(plan.integrationId, plan.resource, result.rows);
            await persistSchema(input.orgId, plan.integrationId, discovered);
            schemasForPlanning.push(discovered); // Update local context for spec generator
          } catch (e) {
             console.warn("Schema inference failed", e);
          }
      }
  }

  // 2. Plan Chat Response (Legacy High-Level Intent)
  const plan = await planChatResponse(input.userMessage);
  console.log("[Chat Orchestrator] Plan:", plan);
  console.log("Chat execution context", {
    requestedIntegration: "github",
    isConnected: input.connectedIntegrationIds.includes("github"),
  });

  function buildCtas(integrationIds: string[]) {
    const uniq = Array.from(new Set(integrationIds));
    return uniq.map((id) => {
      let name = INTEGRATIONS.find((i) => i.id === id)?.name ?? id;
      let logoUrl: string | undefined;
      try {
        const ui = getIntegrationUIConfig(id);
        name = ui.name;
        logoUrl = ui.logoUrl;
      } catch {}
      const connected = input.connectedIntegrationIds.includes(id);
      
      // If manual mode, and not selected, we prompt to Add
      // If manual mode, and selected but not connected, we prompt to Connect
      // If auto mode, and not connected, we prompt to Connect

      // Default behavior (Auto-like):
      const label = connected ? `Reconnect ${name}` : `Connect ${name}`;
      const params = new URLSearchParams();
      params.set("provider", id);
      params.set("source", "chat");
      const action = `/api/oauth/start?${params.toString()}`;
      return { id, name, logoUrl, connected, label, action } satisfies IntegrationCTA;
    });
  }

  // Handle Manual Mode Restrictions
  if (input.integrationMode === "manual") {
    const selected = input.selectedIntegrationIds || [];

    // 1. Strict Rule: All selected integrations MUST be connected.
    // If any selected integration is not connected, block execution immediately.
    const disconnectedSelected = selected.filter((id) => !input.connectedIntegrationIds.includes(id));
    
    if (disconnectedSelected.length > 0) {
      const ctas = disconnectedSelected.map((id) => {
        let name = INTEGRATIONS.find((i) => i.id === id)?.name ?? id;
        try {
           const ui = getIntegrationUIConfig(id);
           name = ui.name;
        } catch {}

        const params = new URLSearchParams();
        params.set("provider", id);
        params.set("source", "chat");
        return {
          id,
          name,
          connected: false,
          label: `Connect ${name}`,
          action: `/api/oauth/start?${params.toString()}`,
        } satisfies IntegrationCTA;
      });

      const names = ctas.map((c) => c.name).join(", ");
      return {
        explanation: `${names} is not connected.`,
        message: { type: "integration_action", integrations: ctas },
        spec: input.currentSpec,
        metadata: { type: "integration_action", integrations: ctas },
      };
    }

    const requestedButNotSelected = plan.requested_integration_ids.filter((id) => !selected.includes(id));

    if (requestedButNotSelected.length > 0) {
      // Return error asking to add them
      // We can use the 'integration_action' type but with a special label?
      // Or just text + client side handling?
      // Requirement: "Show error with option to add it. [ Add GitHub ]"
      
      // We'll return an integration action where the action is effectively "select it"
      // But for now, let's just return the standard connect CTA but maybe the client handles "Add" vs "Connect"?
      // Actually, if it's not selected, the client needs to know to select it.
      // The current system returns "action" url.
      
      // Let's rely on the client to show the right UI based on selection state?
      // No, the backend drives the chat.
      
      const ctas = requestedButNotSelected.map(id => {
         const name = INTEGRATIONS.find((i) => i.id === id)?.name ?? id;
         return {
             id,
             name,
             connected: input.connectedIntegrationIds.includes(id),
             label: `Add ${name}`,
             action: "ui:select_integration" // Special action for client
         } satisfies IntegrationCTA;
      });

      return {
        explanation: `This action requires ${ctas.map(c => c.name).join(", ")}. Please add them to your selection.`,
        message: { type: "integration_action", integrations: ctas },
        spec: input.currentSpec,
        metadata: { type: "integration_action", integrations: ctas },
      };
    }
  }

  if (plan.intent === "integration_request" && plan.requested_integration_ids.length > 0) {
    const integrations = buildCtas(plan.requested_integration_ids);
    return {
      explanation: "",
      message: { type: "integration_action", integrations },
      spec: input.currentSpec,
      metadata: { type: "integration_action", integrations },
    };
  }

  const missingRequested = plan.requested_integration_ids.filter(
    (id) => !input.connectedIntegrationIds.includes(id),
  );
  if (missingRequested.length > 0) {
    const integrations = buildCtas(missingRequested);
    const names = integrations.map((i) => i.name).join(", ");
    return {
      explanation: `Access to ${names} is required.`,
      message: { type: "integration_action", integrations },
      spec: input.currentSpec,
      metadata: { type: "integration_action", integrations },
    };
  }

  // 3. Check Capabilities (if no specific integration requested)
  if (plan.requested_integration_ids.length === 0 && plan.required_capabilities.length > 0) {
    // Check if we have coverage
    const resolution = resolveIntegrations({
      capabilities: plan.required_capabilities as Capability[],
      connectedIntegrations: input.connectedIntegrationIds,
    });

    if (resolution.missingCapabilities.length > 0) {
      // We are missing capabilities. We need to suggest an integration.
      // Simple heuristic: Find the highest priority integration that covers the first missing capability.
      const missingCap = resolution.missingCapabilities[0];
      const candidate = INTEGRATIONS
        .filter(i => i.capabilities.includes(missingCap))
        .sort((a, b) => b.priority - a.priority)[0];
      
      if (candidate) {
        const integrations = buildCtas([candidate.id]);
        return {
          explanation: "",
          message: { type: "integration_action", integrations },
          spec: input.currentSpec,
          metadata: { type: "integration_action", integrations },
        };
      }
      
      // If no candidate found (rare), generic error
      return {
        explanation: `I need a data source that supports ${missingCap.replace("_", " ")}.`,
        message: { type: "text", content: `I need a data source that supports ${missingCap.replace("_", " ") }.`, },
        spec: input.currentSpec,
      };
    }
  }

  // 4. Proceed to Spec Generation
  const schemas = await getDiscoveredSchemas(input.orgId);
  const schemaText = schemas.length > 0 
    ? schemas.map(s => `Integration: ${s.integrationId}, Resource: ${s.resource}\nFields: ${s.fields.map(f => f.name).join(", ")}`).join("\n\n")
    : "No schemas discovered.";

  // Inject Execution Plans into System Prompt
  const validPlans = successfulExecutions.map(e => e.plan);
  const plansText = validPlans.length > 0
    ? `VALIDATED EXECUTION PLANS:\n${JSON.stringify(validPlans, null, 2)}\n\nUse these plans to generate the spec. Each plan corresponds to a view or metric.\nIf "metricRef" is present, USE IT in the spec.`
    : `No successful execution plans. Execution Error: ${executionError || "None"}. If the user asked for data, explain the error. Do NOT create new metrics or views.`;

  const connectedText = input.connectedIntegrationIds.length > 0
    ? input.connectedIntegrationIds.join(", ")
    : "None";
  const finalSystemPrompt = SYSTEM_PROMPT
    .replace("{{SCHEMAS}}", schemaText)
    .replace("{{CONNECTED}}", connectedText)
    + `\n\n${plansText}`;

  let llm: LlmToolChatResponse;
  try {
    llm = await generateSpecUpdate({
      currentSpec: input.currentSpec,
      systemPrompt: finalSystemPrompt,
      messages: input.messages,
      userMessage: input.userMessage,
    });
  } catch {
    return {
      explanation: "I attempted to add this, but the spec was invalid. Please retry.",
      message: { type: "text", content: "I attempted to add this, but the spec was invalid. Please retry." },
      spec: input.currentSpec,
      metadata: { persist: false },
    };
  }
  const beforeMetricIds = new Set(input.currentSpec.metrics.map(m => m.id));
  const afterMetricIds = new Set(llm.spec.metrics.map(m => m.id));
  const createdMetricIds = Array.from(afterMetricIds).filter(id => !beforeMetricIds.has(id));
  let specWithViews = { ...llm.spec };
  const existingViewMetricIds = new Set(specWithViews.views.filter(v => v.type !== "table" && v.metricId).map(v => v.metricId as string));
  const newViews = createdMetricIds
    .filter(id => !existingViewMetricIds.has(id))
    .map(id => {
      const metric = specWithViews.metrics.find(m => m.id === id)!;
      const isTime = Boolean((metric as any).groupBy);
      const type: "metric" | "line_chart" = isTime ? "line_chart" : "metric";
      return { id: `view_${id}`, type, metricId: id };
    });
  if (newViews.length > 0) {
    specWithViews = { ...specWithViews, views: [...specWithViews.views, ...newViews] };
  }
  const wantsContribGraph = executionPlans.some(p => p.integrationId === "github" && (p.resource === "contributions_graph" || p.capabilityId === "ad_hoc_contributions_graph"));
  if (wantsContribGraph) {
    const metricId = "github_commits_per_day";
    const hasMetric = specWithViews.metrics.some(m => m.id === metricId);
    if (!hasMetric) {
      specWithViews.metrics = [
        ...specWithViews.metrics,
        {
          id: metricId,
          label: "Commits per day",
          type: "count",
          table: "commits",
          groupBy: "day",
          integrationId: "github"
        }
      ];
    }
    const hasView = specWithViews.views.some(v => v.metricId === metricId);
    if (!hasView) {
      specWithViews.views = [
        ...specWithViews.views,
        { id: "view_contributions_heatmap", type: "heatmap", metricId }
      ];
    }
  }
  if (process.env.NODE_ENV !== "production") {
    console.log("Created metrics:", createdMetricIds);
    console.log("Created views:", newViews.map(v => v.id));
  }
  const results = await executeDashboard(input.orgId, specWithViews);
  const renderableCount = Object.values(results).filter(r => r.status === "success").length;
  if (process.env.NODE_ENV !== "production") {
    console.log("Render tree size:", Object.keys(results).length);
  }
  if (renderableCount === 0 && createdMetricIds.length > 0) {
    return {
      explanation: "I defined the metric, but couldn’t render it yet.",
      message: { type: "text", content: "I defined the metric, but couldn’t render it yet." },
      spec: input.currentSpec,
      metadata: { persist: false },
    };
  }
  const explanation = newViews.length > 0 ? "I’ve added a view for your new metric." : llm.explanation;
  return {
    explanation,
    message: { type: "text", content: explanation },
    spec: specWithViews,
    metadata: { ...(llm.metadata ?? {}), persist: true },
  };
}
