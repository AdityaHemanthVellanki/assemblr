import { cache } from "react";
import { cookies } from "next/headers";
import { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SessionResult = {
  user: User | null;
  error: any;
};

const refreshLocks = new Map<string, Promise<SessionResult>>();

async function getAccessTokenFromCookies() {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  // Prioritize cookies that clearly look like access tokens
  let authCookie = allCookies.find(c => c.name.endsWith("-auth-token") && c.value.startsWith("{")); // Supabase JSON cookie
  
  if (!authCookie) {
    authCookie = allCookies.find(c => c.name.includes("access-token"));
  }
  
  if (!authCookie) {
    // Fallback: any sb- cookie that isn't explicitly a refresh token
    authCookie = allCookies.find(c => c.name.startsWith("sb-") && !c.name.includes("refresh"));
  }

  if (!authCookie?.value) return null;
  const raw = authCookie.value;
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed?.access_token === "string" ? parsed.access_token : null;
    } catch {
      return null;
    }
  }
  return raw;
}

// This function strictly VALIDATES the session using the admin client.
// It DOES NOT refresh the session. Refreshing is the responsibility of middleware.
export const validateSession = cache(async (): Promise<SessionResult> => {
  const accessToken = await getAccessTokenFromCookies();
  const lockKey = accessToken ?? "anonymous";

  const existing = refreshLocks.get(lockKey);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (!accessToken) {
      return { user: null, error: null };
    }
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.auth.getUser(accessToken);
      if (error) {
        return { user: null, error };
      }
      return { user: data.user, error: null };
    } catch (err) {
      return { user: null, error: err };
    } finally {
      refreshLocks.delete(lockKey);
    }
  })();

  refreshLocks.set(lockKey, promise);
  return promise;
});

// Deprecated alias to prevent import errors if any slipped through, but preferred is validateSession
export const getSession = validateSession;
