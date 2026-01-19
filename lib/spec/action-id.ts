
/**
 * Normalizes an action ID to snake_case.
 * This MUST be used for all action ID definitions, lookups, and references.
 *
 * Rules:
 * 1. Convert to lowercase
 * 2. Replace hyphens with underscores
 * 3. Replace spaces with underscores
 * 4. Remove any other non-alphanumeric characters (except underscores)
 */
export function normalizeActionId(id: string): string {
  if (!id) return "";
  return String(id).toLowerCase().trim().replace(/\s+/g, "_");
}
