import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getServerEnv } from "@/lib/env";

export async function middleware(request: NextRequest) {
  // 1. Validation
  const env = getServerEnv();
  
  // 2. Response initialization
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // 3. Supabase Client
  const supabase = createServerClient(
    env.SUPABASE_URL,
    env.SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // 4. Session Check
  // supabase.auth.getUser() is safer than getSession() as it revalidates the token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 5. Route Protection
  const path = request.nextUrl.pathname;
  const isProtectedRoute = 
    path.startsWith("/app/chat") || 
    path.startsWith("/dashboard") || 
    path.startsWith("/projects");

  if (isProtectedRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (user && path === "/login") {
      const dashboardUrl = request.nextUrl.clone();
      dashboardUrl.pathname = "/dashboard";
      return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     * - api/ (API routes - generally we might want to protect some, but middleware is often for pages)
     * 
     * However, the user said "Protect all routes: /app/chat, /dashboard/*, /projects/*".
     * API routes usually handle their own auth or use middleware.
     * Let's include everything and exclude static.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
