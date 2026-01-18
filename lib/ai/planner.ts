import "server-only";

import { z } from "zod";
import { azureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { CAPABILITY_REGISTRY } from "@/lib/capabilities/registry";
import { DiscoveredSchema } from "@/lib/schema/types";
import { Metric } from "@/lib/metrics/store";
import { CompiledIntent } from "@/lib/core/intent";
import { flattenMiniAppComponents, validateCompiledIntent, repairCompiledIntent, buildExecutionGraph, sanitizeIntegrationsForIntent } from "@/lib/ai/planner-logic";
import { PolicyEngine } from "@/lib/governance/engine";
import { OrgPolicy } from "@/lib/core/governance";
import type { ToolSpec } from "@/lib/spec/toolSpec";

import { SYSTEM_PROMPT } from "@/lib/ai/prompts";

import { getActivityDashboardSpec } from "@/lib/ai/templates/activity-dashboard";

const policyEngine = new PolicyEngine();

function isActivityDashboardIntent(message: string): boolean {
  const normalized = message.toLowerCase();
  const triggers = [
    "activity dashboard",
    "recent activity",
    "unified activity feed",
    "github slack notion activity",
    "activity feed"
  ];
  return triggers.some(t => normalized.includes(t));
}

function buildToolMemory(spec?: ToolSpec): any {
  if (!spec || (spec as any).kind !== "mini_app") return { kind: (spec as any)?.kind ?? "unknown" };
  const mini: any = spec as any;
  const flat = flattenMiniAppComponents(mini);

  const components = flat.map(({ pageId, component }) => ({
    id: component.id,
    pageId,
    type: component.type,
    label: component.label,
    dataSource: component.dataSource,
    properties: {
      title: component.properties?.title,
      bindKey: component.properties?.bindKey,
      loadingKey: component.properties?.loadingKey,
      errorKey: component.properties?.errorKey,
      emptyMessage: component.properties?.emptyMessage,
    },
    events: component.events ?? [],
  }));

  const actions = (mini.actions ?? []).map((a: any) => ({
    id: a.id,
    type: a.type,
    config: a.config,
    steps: a.steps,
  }));

  const stateKeys = Object.keys(mini.state ?? {}).filter((k) => !(k.startsWith("_") || k.startsWith("__")));

  const componentsByActionId: Record<string, Array<{ id: string; pageId: string; type: string; label?: string }>> = {};
  for (const { pageId, component } of flat) {
    for (const e of component.events ?? []) {
      if (!e?.actionId) continue;
      componentsByActionId[e.actionId] = componentsByActionId[e.actionId] ?? [];
      componentsByActionId[e.actionId].push({ id: component.id, pageId, type: component.type, label: component.label });
    }
  }

  const readersByStateKey: Record<string, Array<{ id: string; pageId: string; type: string; label?: string }>> = {};
  for (const { pageId, component } of flat) {
    const keys: string[] = [];
    if (component.dataSource?.type === "state" && typeof component.dataSource.value === "string") keys.push(component.dataSource.value);
    if (typeof component.properties?.bindKey === "string") keys.push(component.properties.bindKey);
    if (typeof component.properties?.loadingKey === "string") keys.push(component.properties.loadingKey);
    if (typeof component.properties?.errorKey === "string") keys.push(component.properties.errorKey);
    for (const k of keys) {
      readersByStateKey[k] = readersByStateKey[k] ?? [];
      readersByStateKey[k].push({ id: component.id, pageId, type: component.type, label: component.label });
    }
  }

  const pipelines = actions
    .filter((a: any) => a.type === "integration_call")
    .map((a: any) => {
      const assignKey = a.config?.assign;
      const statusKey = assignKey ? `${assignKey}Status` : `${a.id}.status`;
      const errorKey = assignKey ? `${assignKey}Error` : `${a.id}.error`;
      return {
        actionId: a.id,
        capabilityId: a.config?.capabilityId,
        assignKey,
        triggerComponents: componentsByActionId[a.id] ?? [],
        readers: assignKey ? readersByStateKey[assignKey] ?? [] : readersByStateKey[`${a.id}.data`] ?? [],
        statusReaders: readersByStateKey[statusKey] ?? [],
        errorReaders: readersByStateKey[errorKey] ?? [],
      };
    });

  return {
    kind: mini.kind,
    title: mini.title,
    description: mini.description,
    pages: (mini.pages ?? []).map((p: any) => ({ id: p.id, name: p.name, layoutMode: p.layoutMode, componentCount: (p.components ?? []).length })),
    stateKeys,
    components,
    actions,
    pipelines,
  };
}



export async function compileIntent(
  userMessage: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  connectedIntegrationIds: string[],
  schemas: DiscoveredSchema[],
  availableMetrics: Metric[] = [],
  mode: "create" | "chat" = "create",
  policies: OrgPolicy[] = [], // Added policies
  currentSpec?: ToolSpec,
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

  const installedIntegrations = connectedCapabilities.map(c => c.integrationId).filter((v, i, a) => a.indexOf(v) === i);
  const installedText = `INSTALLED_INTEGRATIONS (Use these for UI filter options, do NOT rely on runtime data):\n${JSON.stringify(installedIntegrations)}`;

  // 0. Check for Canonical Templates (Bypass AI)
  if (isActivityDashboardIntent(userMessage)) {
      console.log("[Planner] Detected Activity Dashboard intent. Using canonical template.");
      const intent = getActivityDashboardSpec();
      const allowedCapabilityIds = new Set(connectedCapabilities.map((c) => c.id));
      
      // Safety: Downgrade missing capabilities to no-ops
      sanitizeIntegrationsForIntent(intent, allowedCapabilityIds);
      
      // Graph: Ensure execution graph is built and valid
      buildExecutionGraph(intent, currentSpec);
      
      // Validation: Ensure it meets all strictness rules
      validateCompiledIntent(intent, currentSpec, { mode });
      
      return intent;
  }

  const toolMemory = buildToolMemory(currentSpec);
  const prompt =
    SYSTEM_PROMPT.replace("{{CAPABILITIES}}", capsText) +
    `\n\n${installedText}\n\nMODE HINT: ${mode.toUpperCase()}\n\nTOOL_MEMORY (authoritative; reuse this structure):\n${JSON.stringify(toolMemory, null, 2)}`;

  try {
    const contextMessages = history.map(m => ({
      role: m.role,
      content: m.content
    }));

    const response = await azureOpenAIClient.chat.completions.create({
      messages: [
        { role: "system", content: prompt },
        ...contextMessages,
        { role: "user", content: userMessage }
      ],
      model: "gpt-4o",
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const content = response.choices[0].message.content;
    if (!content) throw new Error("No response from AI");

    const parsed = JSON.parse(content);
    try {
      const allowedCapabilityIds = new Set(connectedCapabilities.map((c) => c.id));
      sanitizeIntegrationsForIntent(parsed, allowedCapabilityIds);
      repairCompiledIntent(parsed, currentSpec);
      buildExecutionGraph(parsed, currentSpec);
      validateCompiledIntent(parsed, currentSpec, { mode });
      return parsed;
    } catch (err: any) {
      if (!err || err.code !== "InvalidIntentGraph") {
        console.error("Intent graph validation failed:", err);
        throw err;
      }
      console.warn("[PlannerSafeMode] Graph construction failed, retrying in Safe Mode:", err.message);
      const safeIntent = buildSafeModeIntent(parsed);
      try {
        repairCompiledIntent(safeIntent, currentSpec);
        buildExecutionGraph(safeIntent, currentSpec);
        validateCompiledIntent(safeIntent, currentSpec, { mode });
        return safeIntent;
      } catch (errSafe) {
        console.error("Safe Mode compilation failed:", errSafe);
        throw err;
      }
    }
  } catch (error) {
    console.error("Intent compilation failed:", error);
    throw error;
  }
}

function buildSafeModeIntent(source: any): CompiledIntent {
  const clone: any = JSON.parse(JSON.stringify(source || {}));
  const mutation = clone.tool_mutation || {};
  const actions = Array.isArray(mutation.actionsAdded) ? mutation.actionsAdded : [];
  const primary = actions.find((a: any) => a && a.type === "integration_call") || actions[0];
  mutation.actionsAdded = primary ? [primary] : [];
  if (!Array.isArray(mutation.pagesAdded) || mutation.pagesAdded.length === 0) {
    mutation.pagesAdded = [{ id: "main", name: "Main", events: [] }];
  } else {
    mutation.pagesAdded = [mutation.pagesAdded[0]];
  }
  const firstPage = mutation.pagesAdded[0];
  if (!Array.isArray(firstPage.events)) firstPage.events = [];
  if (primary) {
    const already = firstPage.events.some((e: any) => e && e.actionId === primary.id && e.type === "onPageLoad");
    if (!already) {
      firstPage.events.push({ type: "onPageLoad", actionId: primary.id });
    }
  }
  if (Array.isArray(mutation.componentsAdded) && mutation.componentsAdded.length > 0) {
    mutation.componentsAdded = [mutation.componentsAdded[0]];
  } else {
    mutation.componentsAdded = [];
  }
  clone.tool_mutation = mutation;
  if (!clone.execution_policy) {
    clone.execution_policy = { deterministic: true, parallelizable: false, retries: 0 };
  } else {
    clone.execution_policy.deterministic = true;
    clone.execution_policy.parallelizable = false;
    if (typeof clone.execution_policy.retries !== "number") clone.execution_policy.retries = 0;
  }
  clone.intent_type = clone.intent_type || "create";
  clone.output_mode = clone.output_mode || "mini_app";
  clone.execution_graph = { nodes: [], edges: [] };
  return clone as CompiledIntent;
}
