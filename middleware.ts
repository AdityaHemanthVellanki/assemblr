import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withRefreshLock } from "@/lib/auth/refresh-coordinator";
import { getServerEnv } from "@/lib/env";

function getLockKey(request: NextRequest) {
  const cookies = request.cookies.getAll();
  const accessCookie = cookies.find((c) => c.name.includes("access-token"));
  if (accessCookie?.value) return accessCookie.value;
  return "no-access-token";
}

export async function middleware(request: NextRequest) {
  // Use centralized env validation
  const env = getServerEnv();
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase env missing in middleware");
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // 1. Create response if not exists (preserves other headers)
        response = NextResponse.next({ request });
        
        // 2. Apply to BOTH request and response to ensure downstream visibility
        for (const c of cookiesToSet) {
          request.cookies.set(c.name, c.value);
          response.cookies.set(c.name, c.value, c.options);
        }
      },
    },
  });

  const isAuthFresh = request.cookies.get("auth-fresh")?.value === "true";

  if (isAuthFresh) {
    // If we just logged in, trust the session and skip the expensive refresh check
    // This breaks the redirect loop where the session hasn't fully propagated or is being refreshed aggressively
    return response;
  }

  const lockKey = getLockKey(request);
  const { data: { user }, error } = await withRefreshLock(lockKey, () => supabase.auth.getUser());
  if (error) {
    throw new Error(error.message);
  }

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
