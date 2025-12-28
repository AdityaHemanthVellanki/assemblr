import NextAuth from "next-auth";

import { authOptions } from "@/lib/auth/auth-options";
import { getServerEnv } from "@/lib/env";

const handler = NextAuth(authOptions);

export async function GET(req: Request) {
  getServerEnv();
  return handler(req);
}

export async function POST(req: Request) {
  getServerEnv();
  return handler(req);
}
