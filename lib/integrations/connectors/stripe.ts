import Stripe from "stripe";
import {
  IntegrationConnector,
  ConnectInput,
  ConnectResult,
  FetchInput,
  NormalizedData,
  NormalizedEvents,
} from "../types";

export class StripeConnector implements IntegrationConnector {
  id = "stripe";
  name = "Stripe";
  authType = "oauth" as const;
  capabilities = ["payment_transactions", "subscription_events", "time_series"] as const;

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { apiKey } = input.credentials;
    if (!apiKey) {
      return { success: false, error: "Missing apiKey" };
    }

    try {
      const stripe = new Stripe(apiKey, { apiVersion: "2025-12-15.clover" });
      await stripe.balance.retrieve();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  async fetch(input: FetchInput): Promise<NormalizedData> {
    const credentials = (input as unknown as { credentials: Record<string, string> }).credentials;
    if (!credentials?.apiKey) {
      throw new Error("Stripe connector requires apiKey");
    }

    const stripe = new Stripe(credentials.apiKey, { apiVersion: "2025-12-15.clover" });
    const capability = input.capability;

    let events: unknown[] = [];

    if (capability === "payment_transactions") {
      // Fetch charges
      const charges = await stripe.charges.list({ limit: 100 });
      events = charges.data.map((c) => ({
        timestamp: new Date(c.created * 1000).toISOString(),
        properties: {
          id: c.id,
          amount: c.amount,
          currency: c.currency,
          status: c.status,
          customer: c.customer,
        },
      }));
    } else if (capability === "subscription_events") {
      const subs = await stripe.subscriptions.list({ limit: 100 });
      events = subs.data.map((s) => ({
        timestamp: new Date(s.created * 1000).toISOString(),
        properties: {
          id: s.id,
          status: s.status,
          customer: s.customer,
          plan: s.items.data[0]?.price.id,
        },
      }));
    } else {
      throw new Error(`Capability ${capability} not supported by Stripe connector`);
    }

    const normalized: NormalizedEvents = {
      type: "events",
      events: events as { timestamp: string; properties: Record<string, unknown> }[],
    };

    return normalized;
  }
}
