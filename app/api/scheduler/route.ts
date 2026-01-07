import { NextResponse } from "next/server";
import { globalEventLoop } from "@/lib/scheduler/loop";
import { getServerEnv } from "@/lib/env";
import { requireOrgMember } from "@/lib/auth/permissions";

// This endpoint allows forcing a tick or managing the loop status
// In a serverless environment (Vercel), "Long Running" loop is hard.
// Usually we use Vercel Cron to hit an endpoint like this.

export async function POST(req: Request) {
  try {
    const { ctx } = await requireOrgMember(); // secure it
    
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "tick") {
        await globalEventLoop.tick();
        return NextResponse.json({ status: "ticked" });
    }

    return NextResponse.json({ status: "ok", message: "Use action='tick' to force run" });
  } catch (e) {
      return NextResponse.json({ error: "Unauthorized or Failed" }, { status: 500 });
  }
}
