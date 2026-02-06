
import { NextRequest, NextResponse } from "next/server";
import { getComposioClient } from "@/lib/integrations/composio/client";

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

            if (connection.status === "ACTIVE") {
                // If we have a resume ID, return to the original context
                if (resumeId) {
                    const context = await getResumeContext(resumeId);
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
