import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrgMember } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { ctx } = await requireOrgMember();
    const supabase = await createSupabaseServerClient();
    
    // Assume we have an "org_policies" table
    const { data: policies } = await (supabase.from("org_policies") as any)
        .select("*")
        .eq("org_id", ctx.orgId);
        
    return NextResponse.json(policies || []);
  } catch (e) {
      return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
