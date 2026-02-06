"use server";

export async function refreshSchemas(orgId?: string) {
  // No-op in Composio mode.
  // Composio handles schema discovery dynamically.
  return { success: true };
}
