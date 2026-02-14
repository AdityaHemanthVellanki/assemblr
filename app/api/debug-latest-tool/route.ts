import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { type NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    console.log("Debug route called");
    try {
        const supabase = createSupabaseAdminClient();
        console.log("Supabase client created", !!supabase);

        // Try executions first to verify connection
        const { data: excData, error: excError } = await (supabase.from("prompt_executions") as any).select("*").limit(1);
        if (excError) {
            console.error("Executions error", excError);
            return NextResponse.json({ error: excError, message: "Executions table query failed" }, { status: 500 });
        }
        console.log("Executions query success", excData?.length);

        const { data, error } = await (supabase.from("tool_results") as any)
            .select("*")
            .order("materialized_at", { ascending: false })
            .limit(1);

        if (error) {
            console.error("Tool results error", error);
            return NextResponse.json({ error }, { status: 500 });
        }

        console.log("Tool results query success", data?.length);

        return NextResponse.json(data && data.length > 0 ? data[0] : { message: "No results found" });
    } catch (e: any) { // Type as any to access message
        console.error("Critical error in debug route:", e);
        try {
            const fs = require('fs');
            fs.writeFileSync('/tmp/debug-error.log', e.message + '\n' + e.stack);
        } catch (fsErr) { }
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
