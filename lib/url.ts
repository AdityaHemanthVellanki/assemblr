import { headers } from "next/headers";

/**
 * Resolves the authoritative Base URL for the application.
 * 
 * Priority:
 * 1. X-Forwarded-Host header (for ngrok/proxies)
 * 2. APP_BASE_URL environment variable
 * 3. NEXT_PUBLIC_APP_URL environment variable
 * 4. Fallback to localhost:3000
 */
export async function getBaseUrl(req?: Request): Promise<string> {
    // 1. Try to get from Request object if provided (most accurate for the current incoming request)
    if (req) {
        const url = new URL(req.url);
        // If we are strictly on localhost, maybe trust the URL? 
        // But usually rely on headers for forwarded hosts (ngrok).
        const forwardedHost = req.headers.get("x-forwarded-host");
        const forwardedProto = req.headers.get("x-forwarded-proto");

        if (forwardedHost) {
            const protocol = forwardedProto || "https";
            return `${protocol}://${forwardedHost}`;
        }
    }

    // 2. Try headers() from Next.js (Server Components / Server Actions)
    try {
        const headersList = await headers();
        const forwardedHost = headersList.get("x-forwarded-host");
        const forwardedProto = headersList.get("x-forwarded-proto");

        if (forwardedHost) {
            const protocol = forwardedProto || "https";
            return `${protocol}://${forwardedHost}`;
        }

        // Fallback: If no x-forwarded-host, check 'host' header
        const host = headersList.get("host");
        if (host) {
            // Assume http for localhost unless secure cookie check implies otherwise, 
            // but typically dev is http. Production (Vercel) will have x-forwarded-proto.
            const protocol = host.includes("localhost") ? "http" : "https";
            return `${protocol}://${host}`;
        }
    } catch (e) {
        // headers() might throw if called outside request context (e.g. static generation)
        // Ignore and fall through
    }

    // 3. Env Vars
    if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;

    // 4. Fallback
    return "http://localhost:3000";
}

/**
 * Synchronous version for client-side or non-async contexts.
 * Note: Cannot use headers() here.
 */
export function getBaseUrlSync(): string {
    if (typeof window !== "undefined") {
        return window.location.origin;
    }

    if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;

    return "http://localhost:3000";
}
