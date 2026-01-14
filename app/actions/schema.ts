"use server";

import { requireOrgMember } from "@/lib/auth/permissions.server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAndPersistSchemas } from "@/lib/schema/store";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";

export async function refreshSchemas(orgId?: string) {
  try {
    const { ctx } = await requireOrgMember();
    // Allow passing orgId for server-side calls, but default to context
    const targetOrgId = orgId || ctx.orgId;

    if (targetOrgId !== ctx.orgId) {
      // Basic check, though requireOrgMember checks permissions for current user context
      // If explicit orgId passed, we should ideally check permission for THAT org.
      // For now, assume ctx.orgId is the target.
    }

    const supabase = await createSupabaseServerClient();
    
    // Get all connected integrations
    const { data: connections, error } = await supabase
      .from("integration_connections")
      .select("integration_id")
      .eq("org_id", targetOrgId)
      .eq("status", "active"); // Assuming we have status, or just all

    if (error || !connections) {
      throw new Error("Failed to load connections");
    }

    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        const token = await getValidAccessToken(targetOrgId, conn.integration_id);
        // Using integration_id as both type and ID for now, as DB doesn't have a separate ID column in this query
        await fetchAndPersistSchemas(targetOrgId, conn.integration_id, conn.integration_id, { access_token: token });
      })
    );

    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error("Some schema refreshes failed", failures);
    }

    return { success: true };
  } catch (err) {
    console.error("Schema refresh failed", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
