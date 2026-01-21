import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";

export type SessionResult = {
  user: User | null;
  error: any;
};

// Global in-memory lock for refresh attempts to prevent parallel refresh race conditions within the same process.
// This prevents multiple concurrent requests (e.g. from the same browser client) from trying to refresh 
// the same token simultaneously, which would trigger "refresh_token_already_used".
const refreshLocks = new Map<string, Promise<SessionResult>>();

/**
 * Centralized session resolver that:
 * 1. Caches the result per-request (via React cache)
 * 2. Deduplicates refresh attempts via global in-memory lock
 * 3. Never throws - returns null user on failure
 */
export const getSession = cache(async (): Promise<SessionResult> => {
  const cookieStore = await cookies();
  
  // Create a lock key based on the access token to identify the session.
  // Supabase cookies typically end with 'access-token' or are 'sb-<ref>-auth-token'.
  // We use the first likely auth cookie value we find, or a fallback.
  const allCookies = cookieStore.getAll();
  const authCookie = allCookies.find(c => 
    c.name.includes("access-token") || 
    c.name.includes("auth-token") ||
    c.name.startsWith("sb-")
  );
  
  // If no auth cookie, we can't lock effectively (and likely have no session), 
  // but we should still let supabase client try (it might use other headers).
  // We use "global-anon" as a fallback lock key, effectively serializing anon checks 
  // (which is fast anyway).
  const lockKey = authCookie ? authCookie.value : "global-anon";

  // Check if a refresh is already in flight for this token
  if (refreshLocks.has(lockKey)) {
    // console.log("[Auth] Joining in-flight session resolution", { key: lockKey.substring(0, 10) });
    return refreshLocks.get(lockKey)!;
  }

  const supabase = await createSupabaseServerClient();
  
  const promise = (async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      
      if (error) {
        // If the error is "refresh_token_already_used", it means another request (maybe in another process?) won the race.
        // Or the token is just invalid.
        // We treat this as "logged out" to trigger a safe redirect/error.
        if (error.code === "refresh_token_already_used" || error.status === 401 || error.status === 400) {
             console.warn("[Auth] Session invalid or refresh failed:", error.code);
        } else {
             console.error("[Auth] Session resolution unexpected error:", error);
        }
        return { user: null, error };
      }
      
      return { user: data.user, error: null };
    } catch (err) {
      console.error("[Auth] Session resolution exception:", err);
      return { user: null, error: err };
    } finally {
      // Release lock immediately after resolution
      refreshLocks.delete(lockKey);
    }
  })();

  refreshLocks.set(lockKey, promise);
  return promise;
});
