import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptJson } from "@/lib/security/encryption";
import { processToolChat } from "@/lib/ai/tool-chat";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { executeToolAction } from "@/lib/toolos/runtime";
import type { ToolSystemSpec } from "@/lib/toolos/spec";
import { bootstrapRealUserSession } from "./auth-bootstrap";

type SlackScenario = {
  name: string;
  required: boolean;
  expired: boolean;
};

const scenarios: SlackScenario[] = [
  { name: "slack_expired_not_required", required: false, expired: true },
  { name: "slack_expired_required", required: true, expired: true },
  { name: "slack_valid_required", required: true, expired: false },
];

function buildSlackSpec(): ToolSystemSpec {
  return {
    id: "slack-tool",
    name: "Slack Tool",
    purpose: "Slack runtime verification",
    entities: [],
    actionGraph: { nodes: [], edges: [] },
    state: { initial: {}, reducers: [], graph: { nodes: [], edges: [] } },
    actions: [
      {
        id: "slack.channels.list",
        name: "List Slack channels",
        description: "List Slack channels",
        type: "READ",
        integrationId: "slack",
        capabilityId: "slack_channels_list",
        inputSchema: {},
        outputSchema: {},
        writesToState: false,
      },
    ],
    workflows: [],
    triggers: [],
    views: [],
    permissions: { roles: [], grants: [] },
    integrations: [{ id: "slack", capabilities: ["slack_channels_list"] }],
    derived_entities: [],
    query_plans: [],
    memory: {
      tool: { namespace: "slack-tool", retentionDays: 30, schema: {} },
      user: { namespace: "slack-tool", retentionDays: 30, schema: {} },
    },
    automations: {
      enabled: true,
      capabilities: {
        canRunWithoutUI: true,
        supportedTriggers: [],
        maxFrequency: 1440,
        safetyConstraints: ["approval_required_for_writes"],
      },
    },
    observability: {
      executionTimeline: true,
      recentRuns: true,
      errorStates: true,
      integrationHealth: true,
      manualRetryControls: true,
    },
  };
}

async function upsertSlackConnection(orgId: string, expired: boolean) {
  const admin = createSupabaseAdminClient();
  const expiresAt = expired ? Date.now() - 60_000 : Date.now() + 60 * 60 * 1000;
  const encrypted = encryptJson({
    access_token: expired ? "expired_token" : "valid_token",
    refresh_token: null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  const { error } = await (admin.from("integration_connections") as any).upsert(
    {
      org_id: orgId,
      integration_id: "slack",
      encrypted_credentials: JSON.stringify(encrypted),
      status: "active",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id,integration_id" }
  );
  if (error) {
    throw new Error(`Failed to upsert slack connection: ${error.message}`);
  }
}

async function createToolRow(orgId: string) {
  const admin = createSupabaseAdminClient();
  const { data: toolRow, error: toolError } = await (admin.from("projects") as any)
    .insert({
      org_id: orgId,
      name: "Slack Runtime Tool",
      status: "BUILDING",
      spec: {},
    })
    .select("id")
    .single();
  if (toolError || !toolRow?.id) {
    throw new Error(`Failed to create tool row: ${toolError?.message ?? "unknown error"}`);
  }
  return toolRow.id as string;
}

async function runSlackRuntime(orgId: string, userId: string, expired: boolean) {
  const toolId = await createToolRow(orgId);
  const spec = buildSlackSpec();
  const compiled = buildCompiledToolArtifact(spec);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.includes("slack.com/api")) {
      return new Response(
        JSON.stringify({ ok: true, channels: [{ id: "C1", name: "general" }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(input, init);
  };
  try {
    const result = await executeToolAction({
      orgId,
      toolId,
      compiledTool: compiled,
      actionId: "slack.channels.list",
      input: { limit: 1 },
      userId,
      triggerId: "slack_runtime_test",
      recordRun: false,
    });
    if (expired) {
      const hasWarning = result.events.some((event) => event.type === "integration_warning");
      if (!hasWarning) {
        throw new Error("Expected integration warning for expired slack token");
      }
      if (result.output !== null) {
        throw new Error("Expected null output for expired slack token");
      }
    } else {
      if (!Array.isArray(result.output) || result.output.length === 0) {
        throw new Error("Expected Slack output for valid token");
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runSlackToolChat(orgId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: toolRow, error: toolError } = await (admin.from("projects") as any)
    .insert({
      org_id: orgId,
      name: "Slack Auth Test Tool",
      status: "BUILDING",
      spec: {},
    })
    .select("id")
    .single();
  if (toolError || !toolRow?.id) {
    throw new Error(`Failed to create tool row: ${toolError?.message ?? "unknown error"}`);
  }

  const toolId = toolRow.id as string;
  await processToolChat({
    orgId,
    toolId,
    userId,
    messages: [],
    userMessage: "show slack messages",
    connectedIntegrationIds: ["slack"],
    mode: "create",
  });

  const { data: renderState } = await (admin.from("tool_render_state") as any)
    .select("view_spec, data_ready, view_ready")
    .eq("tool_id", toolId)
    .maybeSingle();
  if (!renderState?.view_spec) {
    throw new Error("Slack required tool missing view_spec");
  }
  const viewSpec = renderState.view_spec;
  if (viewSpec.decision?.kind !== "explain") {
    throw new Error("Slack required with expired token should explain");
  }
  if (viewSpec.integration_statuses?.slack?.status !== "reauth_required") {
    throw new Error("Slack integration status not marked reauth_required");
  }
  if (renderState.view_ready !== true || renderState.data_ready !== false) {
    throw new Error("Slack expired should finalize with view_ready true and data_ready false");
  }
}

async function runE2E() {
  const session = await bootstrapRealUserSession();
  const orgId = session.orgId;
  const userId = session.user.id;

  for (const scenario of scenarios) {
    await upsertSlackConnection(orgId, scenario.expired);
    if (scenario.required && scenario.expired) {
      await runSlackToolChat(orgId, userId);
    } else {
      await runSlackRuntime(orgId, userId, scenario.expired);
    }
    console.log("Slack scenario passed", scenario.name);
  }
}

runE2E().catch((error) => {
  console.error("Slack runtime E2E verification failed:", error);
  process.exit(1);
});
