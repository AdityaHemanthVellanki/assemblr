import { NextResponse } from "next/server";

import { PermissionError, requireOrgMember } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { testIntegrationConnection } from "@/lib/integrations/testIntegration";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { ctx } = await requireOrgMember();
    const { id: integrationId } = await params;

    const supabase = await createSupabaseServerClient();
    const connRes = await supabase
      .from("integration_connections")
      .select("integration_id")
      .eq("org_id", ctx.orgId)
      .eq("integration_id", integrationId)
      .maybeSingle();

    if (connRes.error) {
      return NextResponse.json({ error: connRes.error.message }, { status: 500 });
    }
    if (!connRes.data) {
      return NextResponse.json({ error: "Integration is not connected" }, { status: 404 });
    }

    const result = await testIntegrationConnection({
      orgId: ctx.orgId,
      integrationId,
    });

    if (result.status === "error") {
      return NextResponse.json(result, { status: 502 }); // Bad Gateway / Upstream Error
    }

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
