import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import nodemailer from "nodemailer";

import {
  ORG_ROLES,
  PermissionError,
  requireRole,
} from "@/lib/permissions";
import { getServerEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z
  .object({
    email: z.string().email().max(320),
    role: z.enum(ORG_ROLES),
  })
  .strict();

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  const env = getServerEnv();

  let ctx: Awaited<ReturnType<typeof requireRole>>["ctx"];
  try {
    ({ ctx } = await requireRole("owner"));
  } catch (err) {
    if (err instanceof PermissionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const role = parsed.data.role;

  const supabase = await createSupabaseServerClient();
  const existingMemberRes = await supabase.rpc("org_has_member_email", {
    p_org_id: ctx.orgId,
    p_email: email,
  });
  if (existingMemberRes.error) {
    console.error("check existing member failed", {
      orgId: ctx.orgId,
      email,
      message: existingMemberRes.error.message,
    });
    return NextResponse.json({ error: "Failed to validate invite" }, { status: 500 });
  }

  if (existingMemberRes.data === true) {
    return NextResponse.json(
      { error: "User is already a member of this organization" },
      { status: 400 },
    );
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const inviteCreate = await supabase.from("invites").insert({
    org_id: ctx.orgId,
    email,
    role,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
  });
  if (inviteCreate.error) {
    console.error("create invite failed", {
      orgId: ctx.orgId,
      email,
      message: inviteCreate.error.message,
    });
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }

  const baseUrl = env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/dashboard/members?invite=${encodeURIComponent(
    token,
  )}`;

  if (process.env.NODE_ENV === "production") {
    if (!env.EMAIL_SERVER || !env.EMAIL_FROM) {
      return NextResponse.json(
        { error: "Email is not configured" },
        { status: 500 },
      );
    }
    const transport = nodemailer.createTransport(env.EMAIL_SERVER);
    await transport.sendMail({
      to: email,
      from: env.EMAIL_FROM,
      subject: "You’ve been invited to Assemblr",
      text: `You have been invited to join an Assemblr organization. Accept: ${acceptUrl}`,
      html: `<p>You have been invited to join an Assemblr organization.</p><p><a href="${acceptUrl}">Accept invite</a></p>`,
    });
  }

  return NextResponse.json(
    {
      invite: {
        email,
        role,
        expiresAt: expiresAt.toISOString(),
        acceptUrl:
          process.env.NODE_ENV === "production" ? undefined : acceptUrl,
      },
    },
    { status: 201 },
  );
}
