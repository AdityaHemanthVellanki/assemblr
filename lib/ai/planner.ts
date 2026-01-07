import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { DiscoveredSchema } from "@/lib/schema/types";
import { Metric } from "@/lib/metrics/store";
import { CompiledIntent } from "@/lib/core/intent";
import { PolicyEngine } from "@/lib/governance/engine";
import { OrgPolicy } from "@/lib/core/governance";

const policyEngine = new PolicyEngine();

const SYSTEM_PROMPT = `
You are the Assemblr Intent Compiler.
Your job is to translate user natural language into a deterministic system intent.

CORE RESPONSIBILITY:
- Analyze the user's goal.
- Compile it into a machine-readable "CompiledIntent" structure.
- Decide if the user wants to "chat" (get info), "create" (build a tool), "modify" (edit a tool), or "analyze" (reasoning).

AVAILABLE CAPABILITIES:
{{CAPABILITIES}}

INSTRUCTIONS:
1. **Analyze Intent**:
   - "Show me commits" -> intent_type: "chat"
   - "Build a commit viewer" -> intent_type: "create"
   - "Add a table of issues" -> intent_type: "modify" (if tool exists)
2. **Determine Requirements**:
   - Which integrations are needed? (e.g. "github", "slack")
   - What are the constraints? (e.g. "sort by date", "limit 10")
3. **Tool Mutation (for Create/Modify)**:
   - If creating a tool, define the "tool_mutation" with pages, components, actions, and state.
   - Follow strict Mini App architecture:
     - Pages contain Components.
     - Components trigger Actions via Events.
     - Actions call Capabilities (integration_call) or Mutate State.
   - NEVER guess resources. Use capability IDs.
4. **Tasks (for Chat/Analyze)**:
   - If user wants data, define "tasks" to execute capabilities.

You MUST respond with valid JSON only. Structure:
{
  "intent_type": "chat" | "create" | "modify" | "analyze",
  "system_goal": "string summary of goal",
  "constraints": ["string", "string"],
  "integrations_required": ["github"],
  "output_mode": "text" | "mini_app",
  "execution_policy": {
    "deterministic": true,
    "parallelizable": false,
    "retries": 0
  },
  "tool_mutation": {
    "pagesAdded": [],
    "componentsAdded": [],
    "actionsAdded": [],
    "stateAdded": {}
  },
  "tasks": [
    {
      "id": "t1",
      "capabilityId": "github_commits_list",
      "params": { "owner": "assemblr", "repo": "assemblr" }
    }
  ]
}
`;

export async function compileIntent(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = [],
  mode: "create" | "chat" = "create",
  policies: OrgPolicy[] = [] // Added policies
): Promise<CompiledIntent> {
  getServerEnv();

  // Filter registry to only connected integrations AND Policy Allowed
  const connectedCapabilities = CAPABILITY_REGISTRY.filter((c) => {
    // 1. Check Connectivity
    if (!connectedIntegrationIds.includes(c.integrationId)) return false;

    // 2. Check Governance Policy
    const policyResult = policyEngine.evaluate(policies, {
        integrationId: c.integrationId,
        capabilityId: c.id,
        actionType: "capability_usage"
    });
    
    // If blocked, we exclude it from the prompt so the planner doesn't even try to use it.
    // This is "Policy-Aware Planning" - prevention by omission.
    return policyResult.allowed;
  });

  const capsText = connectedCapabilities
    .map(
      (c) =>
        `- ID: ${c.id}\n  Integration: ${c.integrationId}\n  Params: ${c.supportedFields.join(", ")}${c.constraints?.requiredFilters ? `\n  REQUIRED PARAMS: ${c.constraints.requiredFilters.join(", ")}` : ""}`
    )
    .join("\n\n");

  const prompt = (SYSTEM_PROMPT
    .replace("{{CAPABILITIES}}", capsText)) + `\n\nMODE HINT: ${mode.toUpperCase()}`;

  try {
    const contextMessages = history.map(m => ({
      role: m.role,
      content: m.content
    })).slice(-10);

    const response = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        { role: "system", content: prompt },
        ...contextMessages,
        { role: "user", content: userMessage },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty AI response");

    const result = JSON.parse(content);
    // TODO: Validate with Zod against CompiledIntent schema
    return result as CompiledIntent;
  } catch (err) {
    console.error("Intent compilation failed", err);
    throw new Error("Failed to compile user intent");
  }
}
