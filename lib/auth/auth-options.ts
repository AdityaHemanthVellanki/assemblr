import type { NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";
import GitHubProvider from "next-auth/providers/github";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/db/prisma";

async function ensureUserOrgAndMembership(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { orgId: true, email: true },
  });

  if (!user) return;

  let orgId = user.orgId;
  if (!orgId) {
    const orgName = user.email?.split("@")[1] ?? "Personal";

    const org = await prisma.organization.create({
      data: { name: orgName },
    });

    orgId = org.id;
    await prisma.user.update({
      where: { id: userId },
      data: { orgId },
    });
  }

  const existing = await prisma.membership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    select: { id: true },
  });
  if (existing) return;

  const ownerCount = await prisma.membership.count({
    where: { orgId, role: "OWNER" },
  });

  await prisma.membership.create({
    data: { userId, orgId, role: ownerCount === 0 ? "OWNER" : "VIEWER" },
  });
}

function buildProviders() {
  const providers = [
    EmailProvider({
      from: process.env.EMAIL_FROM ?? "no-reply@assemblr.local",
      server: process.env.EMAIL_SERVER ?? "smtp://localhost:1025",
      async sendVerificationRequest({ identifier, url, provider }) {
        if (process.env.NODE_ENV !== "production") {
          console.log(`Magic link for ${identifier}: ${url}`);
          return;
        }

        if (!process.env.EMAIL_SERVER) {
          throw new Error("EMAIL_SERVER is required in production");
        }

        const transport = nodemailer.createTransport(provider.server);
        await transport.sendMail({
          to: identifier,
          from: provider.from,
          subject: "Sign in to Assemblr",
          text: `Sign in: ${url}`,
          html: `<p>Sign in:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    }),
  ] as NextAuthOptions["providers"];

  if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
    providers.push(
      GitHubProvider({
        clientId: process.env.GITHUB_ID,
        clientSecret: process.env.GITHUB_SECRET,
      }),
    );
  }

  return providers;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: buildProviders(),
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user?.id) return false;
      await ensureUserOrgAndMembership(user.id);
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }

      if (typeof token.userId === "string" && token.orgId === undefined) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId },
          select: { orgId: true },
        });
        token.orgId = dbUser?.orgId ?? null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
        session.user.orgId =
          typeof token.orgId === "string" ? token.orgId : null;
      }
      return session;
    },
  },
};
