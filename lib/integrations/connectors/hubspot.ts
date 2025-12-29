import { Client } from "@hubspot/api-client";
import {
  IntegrationConnector,
  ConnectInput,
  ConnectResult,
  FetchInput,
  NormalizedData,
  NormalizedTable,
} from "../types";

export class HubspotConnector implements IntegrationConnector {
  id = "hubspot";
  name = "HubSpot";
  authType = "api_key" as const;
  capabilities = ["crm_leads", "user_identity"] as const;

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { accessToken } = input.credentials;
    if (!accessToken) {
      return { success: false, error: "Missing accessToken" };
    }

    try {
      const client = new Client({ accessToken });
      await client.crm.contacts.basicApi.getPage(1);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  async fetch(input: FetchInput): Promise<NormalizedData> {
    const credentials = (input as unknown as { credentials: Record<string, string> }).credentials;
    if (!credentials?.accessToken) {
      throw new Error("HubSpot connector requires accessToken");
    }

    const client = new Client({ accessToken: credentials.accessToken });
    const capability = input.capability;

    if (capability === "crm_leads" || capability === "user_identity") {
      const response = await client.crm.contacts.basicApi.getPage(100);
      const rows = response.results.map((contact) => [
        contact.id,
        contact.properties.email,
        contact.properties.firstname,
        contact.properties.lastname,
        contact.createdAt.toISOString(),
      ]);

      const normalized: NormalizedTable = {
        type: "table",
        columns: [
          { name: "id", type: "string" },
          { name: "email", type: "string" },
          { name: "firstname", type: "string" },
          { name: "lastname", type: "string" },
          { name: "created_at", type: "string" },
        ],
        rows,
      };

      return normalized;
    }

    throw new Error(`Capability ${capability} not supported by HubSpot connector`);
  }
}
