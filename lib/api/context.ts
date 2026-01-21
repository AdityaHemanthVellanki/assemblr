import { cache } from "react";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/client";
import { getSession } from "@/lib/auth/session";

export interface ExecutionContext {
  requestId: string;
  userId: string;
  orgId: string;
  user: User;
  org: { id: string; role: string };
  toolId?: string;
  permissions: string[];
  rateLimitBudget: number;
  startTime: number;
}

// Alias for backward compatibility if needed, but we encourage ExecutionContext
export type RequestContext = ExecutionContext;

// Global request-scoped cache for ExecutionContext
export const getRequestContext = cache(async (): Promise<ExecutionContext> => {
  const headersList = await headers();
  const requestId = headersList.get("x-request-id") ?? crypto.randomUUID();
  const startTime = Date.now();

  const supabase = await createSupabaseServerClient();
  
  // 1. Resolve User (Centralized Session Coordinator)
  const { user, error } = await getSession();

  if (error) {
    // If it's a rate limit, bubble it up specifically
    if (error.status === 429) {
      console.warn("[Auth] Rate limited by Supabase. Treating as soft failure.");
      throw new ApiError("Rate limit exceeded", 429);
    }
    // Otherwise, treat as unauthorized (logged out / refresh failed)
    // We do NOT throw here if we want to allow partial context? 
    // No, getRequestContext guarantees a user.
  }

  if (!user) {
      throw new ApiError("Unauthorized: No session found", 401);
  }

  // 2. Resolve Org (if user exists)
  let org: { id: string; role: string } | null = null;
  
  // Try to get org context from header (if passed by middleware/client) or default to first membership
  // In a real app, we might check 'x-org-id'
  const targetOrgId = headersList.get("x-org-id");
  
  try {
      let query = supabase
        .from("memberships")
        .select("org_id, role")
        .eq("user_id", user.id);

      if (targetOrgId) {
          query = query.eq("org_id", targetOrgId);
      }
      
      const { data: memberships, error } = await query.limit(1);
          
      if (!error && memberships && memberships.length > 0) {
          org = { id: memberships[0].org_id, role: memberships[0].role };
      }
  } catch (e) {
      console.warn("[Auth] Failed to fetch org membership", e);
  }

  if (!org) {
      throw new ApiError("Unauthorized: No organization membership", 403);
  }

  return {
    requestId,
    userId: user.id,
    orgId: org.id,
    user,
    org,
    permissions: [org.role],
    rateLimitBudget: 1000,
    startTime,
  };
});
