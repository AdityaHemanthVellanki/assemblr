import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withRefreshLock } from "@/lib/auth/refresh-coordinator";

function getRefreshKey(request: NextRequest) {
  const cookies = request.cookies.getAll();
  const refreshCookie = cookies.find((c) => c.name.includes("refresh-token"));
  if (refreshCookie?.value) return refreshCookie.value;
  return "no-refresh-token";
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        response = NextResponse.next({ request });
        for (const c of cookiesToSet) {
          response.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });

  const refreshKey = getRefreshKey(request);
  const isAuthFresh = request.cookies.get("auth-fresh")?.value === "true";

  if (isAuthFresh) {
    // If we just logged in, trust the session and skip the expensive refresh check
    // This breaks the redirect loop where the session hasn't fully propagated or is being refreshed aggressively
    return response;
  }

  const { data: { session }, error } = await withRefreshLock(refreshKey, async () => {
    console.log("[auth] refresh start", { path: request.nextUrl.pathname });
    // RULE 1: This is the ONLY place in the app allowed to call getSession() and trigger a refresh.
    const result = await supabase.auth.getSession();
    if (result.error) {
      console.error("[auth] refresh error", {
        path: request.nextUrl.pathname,
        code: (result.error as any).code,
        message: (result.error as any).message,
      });
    } else {
      console.log("[auth] refresh complete", { path: request.nextUrl.pathname });
    }
    return result;
  });

  if (error && (error as any).code === "refresh_token_already_used") {
    console.error("[auth] refresh_token_already_used", {
      path: request.nextUrl.pathname,
    });

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);

    const redirect = NextResponse.redirect(loginUrl);

    for (const cookie of request.cookies.getAll()) {
      if (cookie.name.includes("sb-") || cookie.name.includes("supabase")) {
        redirect.cookies.set(cookie.name, "", {
          path: "/",
          maxAge: 0,
        });
      }
    }

    return redirect;
  }

  const user = session?.user;

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
