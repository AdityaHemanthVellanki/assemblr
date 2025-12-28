import {
  generateDashboardSpec,
  type LlmGenerate,
  parseAndValidateDashboardSpecFromJsonText,
} from "@/lib/ai/generateDashboardSpec";

async function run() {
  const fakeLlm: LlmGenerate = async (input) => {
    const lowerUser = input.user.toLowerCase();
    if (lowerUser.includes("revenue") && lowerUser.includes("users")) {
      return JSON.stringify({
        title: "Revenue & Users Dashboard",
        metrics: [
          {
            id: "m_revenue_daily",
            label: "Daily Revenue",
            type: "sum",
            table: "payments",
            field: "amount",
            groupBy: "day",
          },
          {
            id: "m_new_users_daily",
            label: "New Users",
            type: "count",
            table: "users",
            groupBy: "day",
          },
        ],
        views: [
          { id: "v_rev_line", type: "line_chart", metricId: "m_revenue_daily" },
          {
            id: "v_users_line",
            type: "line_chart",
            metricId: "m_new_users_daily",
          },
          { id: "v_rev_kpi", type: "metric", metricId: "m_revenue_daily" },
          { id: "v_users_kpi", type: "metric", metricId: "m_new_users_daily" },
          { id: "v_payments_table", type: "table", table: "payments" },
        ],
      });
    }

    if (lowerUser.includes("support tickets")) {
      return JSON.stringify({
        title: "Support Overview",
        description: "High-level metrics for support operations.",
        metrics: [
          {
            id: "m_tickets",
            label: "Tickets",
            type: "count",
            table: "tickets",
          },
        ],
        views: [
          { id: "v_tickets_kpi", type: "metric", metricId: "m_tickets" },
          { id: "v_tickets_table", type: "table", table: "tickets" },
        ],
      });
    }

    return JSON.stringify({
      title: "Simple Dashboard",
      metrics: [
        { id: "m_events", label: "Events", type: "count", table: "events" },
      ],
      views: [{ id: "v_events", type: "metric", metricId: "m_events" }],
    });
  };

  const spec1 = await generateDashboardSpec(
    { prompt: "Create a dashboard showing daily revenue and new users" },
    { llm: fakeLlm },
  );
  console.log(
    "ok: prompt test 1",
    spec1.title,
    spec1.metrics.length,
    spec1.views.length,
  );

  const spec2 = await generateDashboardSpec(
    { prompt: "Create a dashboard for support tickets" },
    { llm: fakeLlm },
  );
  console.log(
    "ok: prompt test 2",
    spec2.title,
    spec2.metrics.length,
    spec2.views.length,
  );

  try {
    parseAndValidateDashboardSpecFromJsonText("{not json");
    throw new Error("expected invalid json to fail");
  } catch {
    console.log("ok: invalid json fails safely");
  }
}

run().catch((err) => {
  console.error("ai-spec-smoke-tests failed", err);
  process.exit(1);
});
