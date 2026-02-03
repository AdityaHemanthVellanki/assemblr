import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scheduleMetricExecution } from "@/lib/execution/scheduler";
import { getServerEnv } from "@/lib/env";
import { validateRuntimeConfig } from "@/lib/core/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization");
  const env = getServerEnv();
  const runtimeResult = validateRuntimeConfig();
  if (!runtimeResult.ok) {
    return NextResponse.json({ error: runtimeResult.error }, { status: 503 });
  }

  if (runtimeResult.runtimeEnv === "DEV_WITH_REAL_CREDS") {
    return NextResponse.json(
      { error: "Cron is disabled in DEV_WITH_REAL_CREDS. Set RUNTIME_ENV=REAL_RUNTIME and CRON_SECRET to enable." },
      { status: 503 },
    );
  }

  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();

  // Find all scheduled metrics
  // In a real app, this should be paginated or queued
  // For Phase 6, we just fetch all "scheduled" metrics
  // @ts-ignore
  const { data: metrics, error } = await (supabase.from("metrics") as any)
    .select("id, execution_policy")
    .not("execution_policy", "is", null);

  if (error || !metrics) {
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }

  const results: any[] = [];

  for (const m of metrics) {
    const policy = m.execution_policy;
    if (policy?.mode === "scheduled") {
      try {
        const triggered = await scheduleMetricExecution(m.id);
        results.push({ id: m.id, triggered });
      } catch (err) {
        console.error(`Scheduler failed for ${m.id}`, err);
        results.push({ id: m.id, error: String(err) });
      }
    }
  }

  return NextResponse.json({ 
    success: true, 
    scanned: metrics.length, 
    triggered: results.filter(r => r.triggered).length,
    details: results 
  });
}
