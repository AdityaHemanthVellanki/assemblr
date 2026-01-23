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
    userMessage: "show mails about contexto",
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
  if (renderState.data_ready !== true || renderState.view_ready !== true) {
    throw new Error("Render state flags are not true");
  }
  const viewPayload = renderState.view_spec ?? null;
  const views = Array.isArray(viewPayload?.views) ? viewPayload.views : [];
  if (views.length === 0) {
    throw new Error("View spec missing after finalize");
  }
  if (!viewPayload?.answer_contract) {
    throw new Error("Answer contract missing after finalize");
  }
  const googlePlan = (viewPayload?.query_plans ?? []).find((plan: any) => plan.integrationId === "google");
  if (!googlePlan || !String(googlePlan.query?.q ?? "").includes("contexto")) {
    throw new Error("Query plan missing semantic constraint");
  }
  const nonGoogleView = views.find((view: any) => !String(view?.source?.statePath ?? "").startsWith("google."));
  if (nonGoogleView) {
    throw new Error("View spec includes non-Gmail views");
  }
  const mailFields = ["from", "subject", "snippet", "date"];
  const missingFields = mailFields.filter((field) => !views[0]?.fields?.includes(field));
  if (missingFields.length > 0) {
    throw new Error(`Mail view missing fields: ${missingFields.join(", ")}`);
  }
  if (!projectRow || projectRow.data_ready !== true || projectRow.view_ready !== true) {
    throw new Error("Project flags are not true");
  }

  const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const statusRes = await fetch(`${baseUrl}/api/tools/${toolId}/status`);
  if (!statusRes.ok) {
    throw new Error(`Status route failed with ${statusRes.status}`);
  }
  const statusJson = await statusRes.json();
  console.log("Status Route Result", statusJson);
  if (!statusJson?.data?.data_ready || !statusJson?.data?.view_ready) {
    throw new Error("Status route did not return data_ready/view_ready true");
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
  if (!html.includes("Emails") && !html.includes("Email")) {
    throw new Error("UI render does not show email list title");
  }
}

runE2E().catch((err) => {
  console.error("E2E verification failed:", err);
  process.exit(1);
});
