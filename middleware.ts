import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect app routes
  // We include /app, /dashboard, and /projects as they contain protected content
  if (pathname.startsWith("/app") || pathname.startsWith("/dashboard") || pathname.startsWith("/projects")) {
    // Edge-safe session hint ONLY (cookie existence)
    // We check for:
    // 1. The prompt-specified cookies (sb-access-token, sb-refresh-token)
    // 2. The standard Supabase SSR cookie pattern (sb-<ref>-auth-token)
    const hasSession =
      req.cookies.get("sb-access-token") ||
      req.cookies.get("sb-refresh-token") ||
      Array.from(req.cookies.getAll()).some((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));

    if (!hasSession) {
      const loginUrl = new URL("/login", req.url);
      // Preserve the original URL to redirect back after login
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match protected routes
    "/app/:path*",
    "/dashboard/:path*",
    "/projects/:path*",
  ],
};
