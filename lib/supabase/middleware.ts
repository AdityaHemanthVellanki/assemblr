
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    if (!supabaseUrl || !supabaseKey) {
        // If env vars are missing, we can't do auth, but we shouldn't crash the middleware 
        // unless we determine it's critical. For now, proceeding might allow public pages 
        // to work, but auth will fail.
        // However, without Supabase client, we can't check session.
        // Let's assume valid config or return generic response.
        // But returning here means no session update, which might cause the loop again.
        // Ensuring we have these keys is p0.
        // console.error("Middleware missing Supabase keys");
        return response;
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseKey,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value);
                    });
                    response = NextResponse.next({
                        request,
                    });
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options);
                    });
                },
            },
        }
    );

    // refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Protected routes logic
    if (
        request.nextUrl.pathname.startsWith("/app") ||
        request.nextUrl.pathname.startsWith("/dashboard") ||
        request.nextUrl.pathname.startsWith("/onboarding")
    ) {
        if (!user) {
            const url = new URL("/login", request.url);
            url.searchParams.set("next", request.nextUrl.pathname);
            return NextResponse.redirect(url);
        }
    }

    // Auth routes logic (redirect if already logged in)
    if (request.nextUrl.pathname === "/login") {
        if (user) {
            return NextResponse.redirect(new URL("/app", request.url));
        }
    }

    return response;
}
