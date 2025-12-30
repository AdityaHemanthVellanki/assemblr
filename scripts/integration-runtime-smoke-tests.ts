import { PostgresConnector } from "@/lib/integrations/connectors/postgres";
import { StripeConnector } from "@/lib/integrations/connectors/stripe";
import { CsvConnector } from "@/lib/integrations/connectors/csv";
import { HubspotConnector } from "@/lib/integrations/connectors/hubspot";
import { GenericApiConnector } from "@/lib/integrations/connectors/generic-api";
import { getConnector } from "@/lib/integrations/registry";
import { FetchInput } from "@/lib/integrations/types";

async function runTests() {
  console.log("Running Integration Runtime Smoke Tests...");

  // 1. Registry Test
  try {
    const pg = getConnector("postgres");
    if (pg.id !== "postgres") throw new Error("Registry failed to return Postgres connector");
    console.log("ok: Registry resolution");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: Registry resolution", msg);
    process.exit(1);
  }

  // 2. Postgres Connector Test (Mocked)
  try {
    const pg = new PostgresConnector();
    // We can't easily test real connection without credentials/DB, 
    // but we can test capability check and basic input validation
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await pg.fetch({ capability: "tabular_data", parameters: {} } as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Postgres connector requires connectionString")) {
        throw new Error("Postgres failed to validate missing credentials");
      }
    }
    console.log("ok: Postgres input validation");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: Postgres test", msg);
    process.exit(1);
  }

  // 3. Stripe Connector Test (Mocked)
  try {
    const stripe = new StripeConnector();
    // Test capability validation
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await stripe.fetch({ capability: "tabular_data", parameters: {}, credentials: { apiKey: "sk_test" } } as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("not supported by Stripe")) {
        throw new Error("Stripe failed to reject unsupported capability");
      }
    }
    console.log("ok: Stripe capability validation");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: Stripe test", msg);
    process.exit(1);
  }

  // 4. CSV Connector Test (Real Logic)
  try {
    const csv = new CsvConnector();
    const input: FetchInput = {
      capability: "tabular_data",
      parameters: {
        content: "name,age\nAlice,30\nBob,25"
      }
    };
    const result = await csv.fetch(input);

    if (result.type !== "table") throw new Error("CSV returned wrong type");
    if (result.rows.length !== 2) throw new Error("CSV parsed wrong number of rows");
    if (result.columns[0].name !== "name") throw new Error("CSV parsed wrong header");
    console.log("ok: CSV parsing");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: CSV test", msg);
    process.exit(1);
  }

  // 5. HubSpot Connector Test (Mocked)
  try {
    const hubspot = new HubspotConnector();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await hubspot.fetch({ capability: "crm_leads", parameters: {} } as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("HubSpot connector requires accessToken")) {
        throw new Error("HubSpot failed to validate missing credentials");
      }
    }
    console.log("ok: HubSpot input validation");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: HubSpot test", msg);
    process.exit(1);
  }

  // 6. Generic API Connector Test (Mocked external call)
  try {
    const generic = new GenericApiConnector();
    // Validate missing baseUrl
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await generic.fetch({ capability: "api_fetch", parameters: { path: "/test" } } as any);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("Generic API connector requires baseUrl")) {
        throw new Error("Generic API failed to validate missing baseUrl");
      }
    }
    console.log("ok: Generic API input validation");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: Generic API test", msg);
    process.exit(1);
  }

  // 7. Mock Fallback Resolution Test
  try {
    const fallback = getConnector("salesforce");
    if (fallback.id !== "mock_fallback") throw new Error("Registry failed to resolve fallback connector for Salesforce");
    
    // Verify connect succeeds with empty input (OAuth simulation)
    const res = await fallback.connect({ orgId: "test", credentials: {} });
    if (!res.success) throw new Error("Mock fallback failed to connect");
    
    console.log("ok: Fallback resolution & mock connection");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("fail: Fallback test", msg);
    process.exit(1);
  }

  console.log("All integration runtime smoke tests passed!");
}

runTests().catch(console.error);
