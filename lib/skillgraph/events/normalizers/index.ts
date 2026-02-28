import type { IntegrationId } from "@/lib/toolos/spec";
import type { OrgEvent } from "../event-schema";
import { normalizeGitHub } from "./github";
import { normalizeSlack } from "./slack";
import { normalizeLinear } from "./linear";
import { normalizeGeneric } from "./generic";

export type EventNormalizer = (
  rawRecords: any[],
  orgId: string,
  actionHint?: string,
) => OrgEvent[];

/**
 * Dedicated normalizers for integrations with complex/nested API responses.
 * All other integrations fall through to the generic normalizer.
 */
const DEDICATED_NORMALIZERS: Partial<Record<IntegrationId, EventNormalizer>> = {
  github: normalizeGitHub,
  slack: normalizeSlack,
  linear: normalizeLinear,
};

/**
 * Normalize raw Composio action output into canonical OrgEvents.
 *
 * Dispatches to a dedicated normalizer if one exists for the integration,
 * otherwise falls back to the generic heuristic normalizer.
 */
export function normalizeEvents(
  rawRecords: any[],
  orgId: string,
  integrationId: IntegrationId,
  actionHint?: string,
): OrgEvent[] {
  if (!rawRecords || rawRecords.length === 0) return [];

  const dedicated = DEDICATED_NORMALIZERS[integrationId];
  if (dedicated) {
    return dedicated(rawRecords, orgId, actionHint);
  }

  return normalizeGeneric(rawRecords, orgId, integrationId, actionHint);
}

export { normalizeGitHub } from "./github";
export { normalizeSlack } from "./slack";
export { normalizeLinear } from "./linear";
export { normalizeGeneric } from "./generic";
