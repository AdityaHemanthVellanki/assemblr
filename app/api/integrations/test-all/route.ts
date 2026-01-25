import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { testIntegrationConnection } from "@/lib/integrations/testIntegration";

export async function POST() {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();

    // 1. Get all connections
    const { data: connections, error } = await supabase
      .from("integration_connections")
      .select("integration_id")
      .eq("org_id", ctx.orgId);

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 },
      );
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 2. Test concurrently
    const results = await Promise.all(
      connections.map((conn) =>
        testIntegrationConnection({
          orgId: ctx.orgId,
          integrationId: conn.integration_id,
        }).then((res) => ({
          integrationId: conn.integration_id,
          ...res,
        }))
      )
    );

    // 3. Aggregate
    const failed = results.filter((r) => r.status === "error");
    const passed = results.filter((r) => r.status === "ok");

    return NextResponse.json({
      summary: {
        total: results.length,
        passed: passed.length,
        failed: failed.length,
      },
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
