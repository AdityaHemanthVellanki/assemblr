
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PermissionError } from "@/lib/auth/permissions.client";
import { requestCoordinator } from "@/lib/security/rate-limit";

export type RequestContext = {
  userId: string;
  orgId: string;
  user: any;
};

// Cached per request lifecycle
const getCachedUser = cache(async () => {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const key = all.find((c) => c.name.includes("access-token"))?.value ?? "anon";
  
  // Coalesce concurrent calls for the same session
  return requestCoordinator.coalesce(`auth:user:${key}`, async () => {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  });
});

const getCachedOrgId = cache(async (userId: string) => {
  return requestCoordinator.coalesce(`auth:org:${userId}`, async () => {
    const supabase = await createSupabaseServerClient();
    // For now, assume single org or pick first. 
    // In a real app, this might come from a header or cookie.
    const { data } = await supabase
      .from("memberships")
      .select("org_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data?.org_id ?? null;
  });
});

export const getRequestContext = cache(async (): Promise<RequestContext> => {
  const user = await getCachedUser();
  if (!user) {
    throw new PermissionError("Unauthorized", 401);
  }

  const orgId = await getCachedOrgId(user.id);
  if (!orgId) {
    throw new PermissionError("No organization found", 403);
  }

  return {
    userId: user.id,
    orgId,
    user,
  };
});
