import { selectIntegrations } from "@/lib/integrations/selectIntegrations";
import type { CapabilityExtraction } from "@/lib/ai/extractCapabilities";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const stubExtract = async (prompt: string): Promise<CapabilityExtraction> => {
    const p = prompt.toLowerCase();
    if (p.includes("revenue")) {
      return {
        required_capabilities: ["payment_transactions", "time_series"],
        needs_real_time: false,
      };
    }
    if (p.includes("users from database")) {
      return {
        required_capabilities: ["user_identity", "tabular_data"],
        needs_real_time: false,
      };
    }
    if (p.includes("leads from crm")) {
      return {
        required_capabilities: ["crm_leads"],
        needs_real_time: false,
      };
    }
    if (p.includes("users") && p.includes("source")) {
      return {
        required_capabilities: ["user_identity"],
        needs_real_time: false,
        ambiguity_questions: ["Should the users come from your database or your CRM?"],
      };
    }
    return { required_capabilities: ["tabular_data"], needs_real_time: false };
  };

  {
    const res = await selectIntegrations(
      { prompt: "Revenue dashboard", connectedIntegrations: ["stripe"] },
      { extract: stubExtract },
    );
    assert(res.selected.length === 1 && res.selected[0]?.id === "stripe", "expected Stripe selected");
    assert(res.requiresUserInput === false, "expected no user input required");
    console.log("ok: Revenue dashboard -> Stripe");
  }

  {
    const res = await selectIntegrations(
      { prompt: "Users from database", connectedIntegrations: ["postgres"] },
      { extract: stubExtract },
    );
    assert(res.selected.length === 1 && res.selected[0]?.id === "postgres", "expected Postgres selected");
    assert(res.requiresUserInput === false, "expected no user input required");
    console.log("ok: Users from database -> Postgres");
  }

  {
    const res = await selectIntegrations(
      { prompt: "Leads from CRM", connectedIntegrations: ["hubspot"] },
      { extract: stubExtract },
    );
    assert(res.selected.length === 1 && res.selected[0]?.id === "hubspot", "expected HubSpot selected");
    assert(res.requiresUserInput === false, "expected no user input required");
    console.log("ok: Leads from CRM -> HubSpot");
  }

  {
    const res = await selectIntegrations(
      { prompt: "Users source ambiguous", connectedIntegrations: ["postgres", "hubspot"] },
      { extract: stubExtract },
    );
    assert(res.selected.length === 0, "expected no selection on ambiguity");
    assert(res.followUpQuestions.length === 1, "expected a clarification question");
    assert(res.requiresUserInput === true, "expected user input required");
    console.log("ok: Ambiguous user source -> clarification question");
  }

  {
    const res = await selectIntegrations(
      { prompt: "Revenue dashboard", connectedIntegrations: [] },
      { extract: stubExtract },
    );
    assert(res.selected.length === 0, "expected no selection when nothing connected");
    assert(res.missingCapabilities.includes("payment_transactions"), "expected missing payment_transactions");
    assert(res.requiresUserInput === true, "expected user input required");
    console.log("ok: Capability requested but no integration connected -> prompt user");
  }
}

run().catch((err) => {
  console.error("integration-intelligence-smoke-tests failed", err);
  process.exit(1);
});
