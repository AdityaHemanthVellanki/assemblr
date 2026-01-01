import { selectIntegrations } from "@/lib/integrations/selectIntegrations";
import type { CapabilityExtraction } from "@/lib/ai/extractCapabilities";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectThrows<T = unknown>(fn: () => Promise<T>) {
  let threw = false;
  try {
    await fn();
  } catch {
    threw = true;
  }
  if (!threw) throw new Error("expected function to throw");
}

async function run() {
  const stubExtract = async (prompt: string): Promise<CapabilityExtraction> => {
    const p = prompt.toLowerCase();
    if (p.includes("issues from linear")) {
      return {
        required_capabilities: ["issues"],
        needs_real_time: false,
      };
    }
    if (p.includes("users from database")) {
      return {
        required_capabilities: ["user_identity", "tabular_data"],
        needs_real_time: false,
      };
    }
    if (p.includes("messages")) {
      return {
        required_capabilities: ["messaging"],
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
      { prompt: "Issues from Linear", connectedIntegrations: ["linear"] },
      { extract: stubExtract },
    );
    assert(res.selected.length === 1 && res.selected[0]?.id === "linear", "expected Linear selected");
    assert(res.requiresUserInput === false, "expected no user input required");
    console.log("ok: Issues from Linear -> Linear");
  }

  {
    const res = await selectIntegrations(
      { prompt: "Users source ambiguous", connectedIntegrations: ["google", "notion"] },
      { extract: stubExtract },
    );
    // Note: google and notion both have tabular_data, but maybe not user_identity?
    // Google has tabular_data. Notion has tabular_data.
    // The stub returns user_identity. Neither explicitly claims user_identity in registry?
    // Registry: Notion [document_store, tabular_data], Google [tabular_data, ...]
    // So resolveIntegrations might fail or return nothing if capability is missing.
    // But this test expects ambiguity questions, which short-circuit resolveIntegrations.
    assert(res.selected.length === 0, "expected no selection on ambiguity");
    assert(res.followUpQuestions.length === 1, "expected a clarification question");
    assert(res.requiresUserInput === true, "expected user input required");
    console.log("ok: Ambiguous user source -> clarification question");
  }

  {
    const res = await selectIntegrations(
      { prompt: "Messages", connectedIntegrations: [] },
      { extract: stubExtract },
    );
    // Slack has messaging.
    assert(res.selected.length === 0, "expected no selection when nothing connected");
    assert(res.missingCapabilities.includes("messaging"), "expected missing messaging");
    assert(res.requiresUserInput === true, "expected user input required");
    console.log("ok: Capability requested but no integration connected -> prompt user");
  }

  {
    const supabase = {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: [{ integration_id: "github" }], error: null };
              },
            };
          },
        };
      },
    };
    const rows = await loadIntegrationConnections({ supabase, orgId: "org_1" });
    assert(rows.length === 1 && rows[0]?.integration_id === "github", "expected 1 integration connection");
    console.log("ok: Integration connections -> returns connected rows");
  }

  {
    const supabase = {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: [], error: null };
              },
            };
          },
        };
      },
    };
    const rows = await loadIntegrationConnections({ supabase, orgId: "org_1" });
    assert(Array.isArray(rows) && rows.length === 0, "expected empty list for zero integrations");
    console.log("ok: Integration connections -> empty array for org with no connections");
  }

  {
    const supabase = {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: null, error: null };
              },
            };
          },
        };
      },
    };
    await expectThrows(() => loadIntegrationConnections({ supabase, orgId: "org_1" }));
    console.log("ok: Integration connections -> null data throws (RLS-style failure)");
  }

  {
    const schemaError = {
      message: 'relation "integration_connections" does not exist',
      code: "42P01",
    };
    const supabase = {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: null, error: schemaError };
              },
            };
          },
        };
      },
    };
    await expectThrows(() => loadIntegrationConnections({ supabase, orgId: "org_1" }));
    console.log("ok: Integration connections -> schema error throws");
  }

  {
    const supabaseError = { message: "permission denied for table integration_connections", code: "42501" };
    const supabase = {
      from() {
        return {
          select() {
            return {
              async eq() {
                return { data: null, error: supabaseError };
              },
            };
          },
        };
      },
    };
    await expectThrows(() => loadIntegrationConnections({ supabase, orgId: "org_1" }));
    console.log("ok: Integration connections -> Supabase error throws");
  }
}

run().catch((err) => {
  console.error("integration-intelligence-smoke-tests failed", err);
  process.exit(1);
});
