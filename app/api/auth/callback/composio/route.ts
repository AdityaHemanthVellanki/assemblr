
import { NextRequest, NextResponse } from "next/server";
import { getComposioClient } from "@/lib/integrations/composio/client";
import { resolveAssemblrId } from "@/lib/integrations/composio/config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const url = new URL(req.url); // Use standard URL object from request
    const status = url.searchParams.get("status");
    const connectedAccountId = url.searchParams.get("connectedAccountId");
    const message = url.searchParams.get("message");
    const resumeId = url.searchParams.get("resumeId");

    const { getResumeContext } = await import("@/app/actions/oauth");

    if (status === "error" || message) {
        console.error(`[Composio Callback] Error: ${message}`);
        return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?error=${encodeURIComponent(message || "Unknown error")}`);
    }

    if (connectedAccountId) {
        try {
            const client = getComposioClient();
            // Verify connection status
            const connection = await client.connectedAccounts.get({ connectedAccountId });

            if ((connection.status as string) === "ACTIVE" || (connection.status as string) === "CONNECTED") {
                // Persistent State Logic
                if (resumeId) {
                    const { getResumeContext } = await import("@/app/actions/oauth");
                    const context = await getResumeContext(resumeId);

                    if (context) {
                        const { createSupabaseServerClient } = await import("@/lib/supabase/server");
                        const supabase = await createSupabaseServerClient();

                        // Reverse-map Composio appName → Assemblr integration ID (e.g., "googlesheets" → "google")
                        const integrationId = connection.appName ? resolveAssemblrId(connection.appName) : connection.integrationId;

                        console.log(`[Composio Callback] Persisting connection for ${integrationId} in Org ${context.orgId}`);

                        // 1. Save to integration_connections (Individual Connection)
                        await supabase.from("integration_connections").upsert({
                            org_id: context.orgId,
                            integration_id: integrationId,
                            composio_connection_id: connection.id,
                            user_id: context.userId,
                            status: connection.status.toLowerCase(),
                            label: (connection as any).label || null,
                            scopes: (connection as any).scopes || [],
                            connected_at: new Date().toISOString()
                        }, { onConflict: "composio_connection_id" });

                        // 2. Update org_integrations (High-level Status)
                        await supabase.from("org_integrations").upsert({
                            org_id: context.orgId,
                            integration_id: integrationId,
                            status: "active",
                            scopes: (connection as any).scopes || [],
                            connected_at: new Date().toISOString()
                        }, { onConflict: "org_id, integration_id" });
                    }

                    // Resume context redirect
                    if (context?.returnPath) {
                        const finalUrl = new URL(context.returnPath, process.env.NEXT_PUBLIC_APP_URL);
                        finalUrl.searchParams.set("integration_connected", "true");
                        finalUrl.searchParams.set("integrationId", connection.integrationId);
                        console.log(`[Composio Callback] Success. Resuming to: ${finalUrl.toString()}`);
                        return NextResponse.redirect(finalUrl);
                    }
                }

                // Default success redirect
                return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?success=true&integrationId=${connection.integrationId}`);
            }
        } catch (e) {
            console.error("Failed to verify Composio connection", e);
        }
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations`);
}
