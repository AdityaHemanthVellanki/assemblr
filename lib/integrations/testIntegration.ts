import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { decryptJson } from "@/lib/security/encryption";
import { getValidAccessToken } from "./tokenRefresh";
import { getConnector, getIntegrationUIConfig } from "./registry";

export type TestResult = {
  status: "ok" | "error";
  error?: {
    code?: string;
    message: string;
    provider?: string;
  };
};

export async function testIntegrationConnection({
  orgId,
  integrationId,
}: {
  orgId: string;
  integrationId: string;
}): Promise<TestResult> {
  const supabase = createSupabaseAdminClient();
  const startTime = Date.now();

  const isMissingIntegrationHealthTable = (message: string) =>
    message.includes("Could not find the table 'public.integration_health' in the schema cache") ||
    message.includes("Could not find the table \"public.integration_health\" in the schema cache") ||
    message.includes('relation "public.integration_health" does not exist') ||
    message.includes("relation \"public.integration_health\" does not exist");

  try {
    const ui = getIntegrationUIConfig(integrationId);

    if (ui.auth.type === "oauth") {
      const accessToken = await getValidAccessToken(orgId, integrationId);

      switch (integrationId) {
        case "stripe": {
          const res = await fetch("https://api.stripe.com/v1/account", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error(`Stripe API returned ${res.status}`);
          break;
        }
        case "github": {
          const res = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "Assemblr-Test-Bot",
            },
          });
          if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
          break;
        }
        case "google_analytics": {
          const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error(`Google API returned ${res.status}`);
          break;
        }
        case "slack": {
          const res = await fetch("https://slack.com/api/auth.test", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          });
          const data = await res.json();
          if (!data.ok) throw new Error(`Slack API error: ${data.error}`);
          break;
        }
        case "salesforce": {
          throw new Error("Salesforce test implementation requires instance_url storage logic");
        }
        case "hubspot": {
          const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!res.ok) throw new Error(`HubSpot API returned ${res.status}`);
          break;
        }
        case "notion": {
          const res = await fetch("https://api.notion.com/v1/users/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
            },
          });
          if (!res.ok) throw new Error(`Notion API returned ${res.status}`);
          break;
        }
        default:
          throw new Error(`No test implemented for integration: ${integrationId}`);
      }
    } else {
      const { data: connections, error } = await supabase
        .from("integration_connections")
        .select("encrypted_credentials")
        .eq("org_id", orgId)
        .eq("integration_id", integrationId)
        .limit(2);

      if (error || !connections) {
        throw new Error(
          `Failed to load credentials for ${integrationId}: ${error?.message ?? "missing row"}`,
        );
      }
      if (!Array.isArray(connections) || connections.length === 0) {
        throw new Error(`Failed to load credentials for ${integrationId}: missing row`);
      }
      if (connections.length > 1) {
        throw new Error(`Multiple connection rows found for integration ${integrationId}`);
      }
      const connection = connections[0] as { encrypted_credentials: string };

      const raw = connection.encrypted_credentials as unknown;
      const enc = typeof raw === "string" ? JSON.parse(raw) : raw;
      const credentials = decryptJson(enc as never) as Record<string, string>;

      const connector = getConnector(integrationId);
      const connectRes = await connector.connect({ orgId, credentials });
      if (!connectRes.success) {
        throw new Error(connectRes.error ?? "Integration connect test failed");
      }
    }

    const latency = Date.now() - startTime;

    const okRes = await supabase.from("integration_health").upsert(
      {
        org_id: orgId,
        integration_id: integrationId,
        status: "ok",
        latency_ms: latency,
        last_checked_at: new Date().toISOString(),
        error_message: null,
        error_code: null,
      },
      { onConflict: "org_id,integration_id" },
    );
    if (okRes.error) {
      if (isMissingIntegrationHealthTable(okRes.error.message)) {
        return { status: "ok" };
      }
      throw new Error(`Failed to persist integration health: ${okRes.error.message}`);
    }

    return { status: "ok" };

  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";

    const skipHealthWrite =
      message.includes("No connection found for integration") ||
      message.includes("missing row") ||
      message.includes("Integration is not connected");

    if (!skipHealthWrite) {
      const errRes = await supabase.from("integration_health").upsert(
        {
          org_id: orgId,
          integration_id: integrationId,
          status: "error",
          error_message: message,
          last_checked_at: new Date().toISOString(),
        },
        { onConflict: "org_id,integration_id" },
      );
      if (errRes.error) {
        if (isMissingIntegrationHealthTable(errRes.error.message)) {
          return {
            status: "error",
            error: {
              message,
              provider: integrationId,
            },
          };
        }
        throw new Error(`Failed to persist integration health: ${errRes.error.message}`);
      }
    }

    return {
      status: "error",
      error: {
        message,
        provider: integrationId,
      },
    };
  }
}
