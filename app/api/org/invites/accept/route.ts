import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";

import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    token: z.string().min(16),
  })
  .strict();

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  getServerEnv();

  const supabase = await createSupabaseServerClient();
  const userRes = await supabase.auth.getUser();
  if (userRes.error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!userRes.data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const tokenHash = hashToken(parsed.data.token);

  const res = await supabase.rpc("accept_invite", { p_token_hash: tokenHash });
  if (res.error) {
    const message = res.error.message;
    if (message.includes("invite_not_found")) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (message.includes("invite_expired")) {
      return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
    }
    if (message.includes("invite_email_mismatch")) {
      return NextResponse.json({ error: "Invite email does not match signed-in user" }, { status: 403 });
    }

    console.error("accept invite failed", {
      userId: userRes.data.user.id,
      message,
    });
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
