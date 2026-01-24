import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processToolChat } from "@/lib/ai/tool-chat";
import { bootstrapRealUserSession } from "./auth-bootstrap";

async function runE2E() {
  const admin = createSupabaseAdminClient();
  const session = await bootstrapRealUserSession();
  const orgId = session.orgId;
  const userId = session.user.id;
  console.log("E2E Env", {
    supabaseUrl: process.env.SUPABASE_URL ?? null,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  });

  const requiredColumns = ["tool_id", "data_ready", "view_ready", "snapshot", "view_spec", "created_at"];
  const { error: schemaError } = await (admin.from("tool_render_state") as any)
    .select(requiredColumns.join(","))
    .limit(1);

  if (schemaError) {
    throw new Error(`Schema check failed for tool_render_state: ${schemaError.message}`);
  }

  const { data: toolRow, error: toolError } = await (admin.from("projects") as any)
    .insert({
      org_id: orgId,
      name: "E2E Tool",
      status: "BUILDING",
      spec: {},
    })
    .select("id")
    .single();

  if (toolError || !toolRow?.id) {
    throw new Error(`Failed to create tool row: ${toolError?.message ?? "unknown error"}`);
  }

  const toolId = toolRow.id as string;

  const response = await processToolChat({
    orgId,
    toolId,
    userId,
    currentSpec: null,
    messages: [],
    userMessage: "show mails about contexto wherever build failed and show that particular commit on github wherever it failed",
    connectedIntegrationIds: ["github", "google", "linear", "notion", "slack"],
    mode: "create",
  });

  const { data: renderState, error: renderStateError } = await (admin.from("tool_render_state") as any)
    .select(requiredColumns.join(","))
    .eq("tool_id", toolId)
    .maybeSingle();

  const { data: probeRows, error: probeError } = await (admin.from("tool_render_state") as any)
    .select(requiredColumns.join(","))
    .limit(1);

  const { data: projectRow, error: projectError } = await (admin.from("projects") as any)
    .select("data_ready, view_ready, data_snapshot, view_spec, status")
    .eq("id", toolId)
    .maybeSingle();

  console.log("E2E Result", {
    toolId,
    response: { explanation: response.explanation, status: response.metadata?.status ?? null },
    renderState,
    renderStateError,
    renderStateSchemaProbe: probeRows ? "ok" : null,
    renderStateSchemaProbeError: probeError ?? null,
    projectRow,
    projectError,
  });

  if (!renderState) {
    throw new Error("Render state missing after finalize");
  }
  if (renderState.view_ready !== true) {
    throw new Error("Render state view_ready is not true");
  }
  const viewPayload = renderState.view_spec ?? null;
  const views = Array.isArray(viewPayload?.views) ? viewPayload.views : [];
  if (viewPayload?.decision?.kind !== "ask" && !viewPayload?.goal_plan?.primary_goal) {
    throw new Error("Goal plan missing after finalize");
  }
  if (!viewPayload?.goal_validation) {
    throw new Error("Goal validation missing after finalize");
  }
  if (!viewPayload?.decision) {
    throw new Error("Decision missing after finalize");
  }
  if (viewPayload?.decision?.kind !== "ask" && !viewPayload?.answer_contract) {
    throw new Error("Answer contract missing after finalize");
  }
  if (viewPayload?.decision?.kind !== "ask") {
    const googlePlan = (viewPayload?.query_plans ?? []).find((plan: any) => plan.integrationId === "google");
    if (!googlePlan || !String(googlePlan.query?.q ?? "").includes("contexto")) {
      throw new Error("Query plan missing semantic constraint");
    }
  }
  if (viewPayload?.decision?.kind === "render") {
    if (views.length === 0) {
      throw new Error("View spec missing after finalize");
    }
    const failureView = views.find((view: any) => String(view?.source?.statePath ?? "").includes("derived.failure_incidents"));
    if (!failureView) {
      throw new Error("Failure incidents view missing");
    }
    const requiredFields = ["repo", "commitSha", "failureType", "failedAt", "emailCount"];
    const missingFields = requiredFields.filter((field) => !failureView?.fields?.includes(field));
    if (missingFields.length > 0) {
      throw new Error(`Failure view missing fields: ${missingFields.join(", ")}`);
    }
  }
  const expectedDataReady = viewPayload.goal_validation.level === "satisfied";
  if (!projectRow || projectRow.view_ready !== true || projectRow.data_ready !== expectedDataReady) {
    throw new Error("Project flags are not consistent with goal validation");
  }

  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const statusRes = await fetch(`${baseUrl}/api/tools/${toolId}/status`);
  if (!statusRes.ok) {
    throw new Error(`Status route failed with ${statusRes.status}`);
  }
  const statusJson = await statusRes.json();
  console.log("Status Route Result", statusJson);
  if (!statusJson?.data?.view_ready) {
    throw new Error("Status route did not return view_ready true");
  }
  if (statusJson?.data?.data_ready !== expectedDataReady) {
    throw new Error("Status route data_ready does not match goal validation");
  }

  const email = process.env.E2E_TEST_USER_EMAIL ?? "";
  const password = process.env.E2E_TEST_USER_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("Missing E2E_TEST_USER_EMAIL or E2E_TEST_USER_PASSWORD for UI verification");
  }

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed with ${loginRes.status}`);
  }
  const setCookies = (loginRes.headers as any).getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    throw new Error("Login did not return auth cookies");
  }
  console.log("UI Auth Cookies", { count: setCookies.length });
  const cookieHeader = setCookies.map((cookie: string) => cookie.split(";")[0]).join("; ");

  const pageRes = await fetch(`${baseUrl}/dashboard/projects/${toolId}`, {
    headers: { cookie: cookieHeader },
    redirect: "manual",
  });
  if (pageRes.status >= 300 && pageRes.status < 400) {
    throw new Error(`UI redirect to ${pageRes.headers.get("location")}`);
  }
  const html = await pageRes.text();
  if (!pageRes.ok) {
    throw new Error(`UI page failed with ${pageRes.status}: ${html.slice(0, 200)}`);
  }
  if (html.includes("Auth session missing")) {
    throw new Error("UI render failed due to missing auth session");
  }
  if (html.includes("No data returned")) {
    throw new Error("UI render shows 'No data returned'");
  }
  if (html.includes("Fetched Data")) {
    throw new Error("UI render shows fallback summary");
  }
  if (viewPayload?.decision?.kind === "render") {
    if (!html.includes("Contexto Build Failures")) {
      throw new Error("UI render does not show failure title");
    }
  }
}

runE2E().catch((err) => {
  console.error("E2E verification failed:", err);
  process.exit(1);
});
