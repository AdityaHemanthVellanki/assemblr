import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

  // Strict protection for app routes
  if (pathname.startsWith("/app") || pathname.startsWith("/dashboard") || pathname.startsWith("/projects")) {
    // Heuristic: Check for Supabase session cookie to avoid invoking full client in middleware.
    // Real auth validation happens in Server Components/Actions.
    // Cookie format: sb-<project-ref>-auth-token.
    // We check if ANY cookie matching the pattern exists, or just check simple presence.

    // Cookie format: sb-<project-ref>-auth-token.0, .1 etc if chunked, or just -auth-token
    // We check if ANY cookie matching the pattern exists.
    const hasAuthCookie = request.cookies.getAll().some(c =>
      c.name.startsWith("sb-") && c.name.includes("-auth-token")
    );

    if (!hasAuthCookie) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // NOTE: We do NOT redirect authenticated users away from /login in middleware anymore
  // because that requires verifying the session (expensive/risky in edge).
  // Layouts/Pages should handle "Already Logged In" redirection.

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - auth/callback (important to let callback run without interference, though it just exchanges code)
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
