import "server-only";
import { getValidAccessToken } from "./tokenRefresh";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type IntegrationHealth = {
    connected: boolean;
    tokenValid: boolean;
    lastCheckedAt: string;
    error?: string;
};

export async function checkIntegrationHealth(orgId: string, integrationId: string): Promise<IntegrationHealth> {
    // 1. Check DB connection first
    const supabase = await createSupabaseServerClient();
    const { data: connection } = await supabase
        .from("integration_connections")
        .select("status")
        .eq("org_id", orgId)
        .eq("integration_id", integrationId)
        .single();

    if (!connection || connection.status !== "active") {
        return {
            connected: false,
            tokenValid: false,
            lastCheckedAt: new Date().toISOString(),
            error: "Not connected"
        };
    }

    // 2. Check Token Validity (Decryption)
    try {
        const token = await getValidAccessToken(orgId, integrationId);
        if (!token) throw new Error("Token missing");
        
        // TODO: Implement actual API verification if needed (e.g. /user/me)
        // This would slow down checks significantly, so maybe do it async or on demand.
        
        return {
            connected: true,
            tokenValid: true,
            lastCheckedAt: new Date().toISOString()
        };
    } catch (e: any) {
        return {
            connected: true,
            tokenValid: false,
            lastCheckedAt: new Date().toISOString(),
            error: e.message
        };
    }
}
