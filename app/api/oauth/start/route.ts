import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";

import { requireOrgMember } from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// ... imports

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  getServerEnv();
  const baseUrl = await getBaseUrl(req);
  console.log(`[OAuth Start] Resolved Base URL: ${baseUrl}`);

  const url = new URL(req.url);
  const providerId = url.searchParams.get("provider");
  const resumeId = url.searchParams.get("resumeId");
  const paramsStr = url.searchParams.get("params");

  if (!resumeId) {
    console.error(`[OAuth Start] CRITICAL: Missing resumeId. Request URL: ${req.url}`);
    const errorUrl = new URL("/error", baseUrl);
    errorUrl.searchParams.set("title", "Integration Error");
    errorUrl.searchParams.set("message", "Missing context for integration. Please try again from the chat.");
    return NextResponse.redirect(errorUrl);
  }

  // Helper to redirect with error
  const redirectWithError = (msg: string) => {
    const targetUrl = new URL("/dashboard", baseUrl);
    targetUrl.searchParams.set("error", msg);
    return NextResponse.redirect(targetUrl);
  };

  if (!providerId) {
    return redirectWithError("Invalid provider");
  }

  // Auth check
  let ctx;
  try {
    ({ ctx } = await requireOrgMember());
  } catch {
    return NextResponse.redirect(new URL("/login", baseUrl));
  }

  try {
    const { createConnection } = await import("@/lib/integrations/composio/connection");

    let connectionParams: Record<string, any> | undefined;
    if (paramsStr) {
      try {
        const decoded = Buffer.from(paramsStr, "base64").toString("utf-8");
        connectionParams = JSON.parse(decoded);
      } catch (e) {
        console.error("[OAuth Start] Invalid params", e);
      }
    }

    // We pass resumeId in the redirectUri so the callback can handle it
    const { redirectUrl } = await createConnection(ctx.orgId, providerId, resumeId, connectionParams);

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    console.error("[OAuth Start] Initialization Error:", error);
    return redirectWithError(error.message || "Failed to start integration flow");
  }
}

