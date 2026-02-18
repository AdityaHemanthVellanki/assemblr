import { getComposioClient } from "./client";
import { INTEGRATION_AUTH_CONFIG } from "./config";

/**
 * List available trigger event types for an integration from Composio.
 */
export async function listAvailableTriggers(
  integrationId: string,
): Promise<Array<{ name: string; displayName: string; description: string }>> {
  const config = INTEGRATION_AUTH_CONFIG[integrationId];
  if (!config) return [];

  const composio = getComposioClient();
  try {
    const triggers = await composio.triggers.list({
      appNames: [config.appName],
    } as any);
    const triggerList = (triggers as any).items ?? (triggers as any) ?? [];

    return (Array.isArray(triggerList) ? triggerList : []).map((t: any) => ({
      name: t.name ?? t.enum ?? "",
      displayName: t.displayName ?? t.display_name ?? t.name ?? "",
      description: t.description ?? "",
    }));
  } catch (err) {
    console.error(`[ComposioTriggers] Failed to list triggers for ${integrationId}:`, err);
    return [];
  }
}

/**
 * Subscribe to a Composio trigger for an entity.
 * Returns the subscription ID from Composio.
 */
export async function subscribeTrigger(params: {
  entityId: string;
  triggerName: string;
  webhookUrl: string;
}): Promise<{ subscriptionId: string } | null> {
  const composio = getComposioClient();
  try {
    const result = await composio.triggers.subscribe({
      triggerName: params.triggerName,
      entityId: params.entityId,
      config: {
        webhookUrl: params.webhookUrl,
      },
    } as any);

    const id =
      (result as any)?.triggerId ??
      (result as any)?.id ??
      (result as any)?.subscriptionId ??
      null;

    if (!id) {
      console.warn("[ComposioTriggers] Subscribe returned no ID:", result);
      return null;
    }

    return { subscriptionId: String(id) };
  } catch (err) {
    console.error("[ComposioTriggers] Failed to subscribe:", err);
    return null;
  }
}

/**
 * Unsubscribe from a Composio trigger.
 */
export async function unsubscribeTrigger(subscriptionId: string): Promise<boolean> {
  const composio = getComposioClient();
  try {
    await (composio.triggers as any).unsubscribe({ triggerId: subscriptionId });
    return true;
  } catch (err) {
    console.error("[ComposioTriggers] Failed to unsubscribe:", err);
    return false;
  }
}
