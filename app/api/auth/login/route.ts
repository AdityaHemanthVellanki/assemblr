import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const bodySchema = z
  .object({
    email: z.string().email().max(320),
    password: z.string().min(8).max(200),
  })
  .strict();

async function createRouteHandlerSupabaseClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.SUPABASE_URL,
    env.SUPABASE_SECRET_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const c of cookiesToSet) {
            cookieStore.set(c.name, c.value, c.options);
          }
        },
      },
    },
  );
}

export async function POST(req: Request) {
  getServerEnv();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = await createRouteHandlerSupabaseClient();
  const res = await supabase.auth.signInWithPassword({
    email: parsed.data.email.trim().toLowerCase(),
    password: parsed.data.password,
  });

  if (res.error || !res.data.user || !res.data.session) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true }, { status: 200 });

  // Manually persist session cookies with strict attributes
  // We iterate over cookies set by Supabase (via cookieStore) and enforce attributes
  const cookieStore = await cookies();
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  };

  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith("sb-")) {
      response.cookies.set(cookie.name, cookie.value, cookieOptions);
    }
  }
  
  // Set a flag to skip immediate refresh in middleware
  response.cookies.set("auth-fresh", "true", {
    ...cookieOptions,
    maxAge: 30, // 30 seconds
    httpOnly: false, // Allow client to read if needed
  });

  return response;
}
