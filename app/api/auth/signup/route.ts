import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(200),
  })
  .strict();

export async function POST(req: Request) {
  getServerEnv();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const url = new URL(req.url);
  const emailRedirectTo = new URL("/auth/callback?next=%2Fdashboard", url.origin).toString();

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
    options: { emailRedirectTo },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      userId: data.user?.id ?? null,
      session: data.session ? { ok: true } : null,
    },
    { status: 201 },
  );
}
