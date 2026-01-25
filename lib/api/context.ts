import { cache } from "react";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { User } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/client";

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

export const getRequestContext = cache(async (): Promise<ExecutionContext> => {
  const headersList = await headers();
  const requestId = headersList.get("x-request-id") ?? crypto.randomUUID();
  const startTime = Date.now();

  const supabase = await createSupabaseServerClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
      throw new ApiError("Unauthorized: No session found", 401);
  }

  let org: { id: string; role: string } | null = null;
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

export const getExecutionContext = getRequestContext;

export const getOptionalRequestContext = cache(async (): Promise<{
  ctx: ExecutionContext | null;
  requiresAuth: boolean;
  error?: ApiError;
}> => {
  const headersList = await headers();
  const requestId = headersList.get("x-request-id") ?? crypto.randomUUID();
  const startTime = Date.now();
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { ctx: null, requiresAuth: true };
  }

  const targetOrgId = headersList.get("x-org-id");
  let org: { id: string; role: string } | null = null;
  try {
    let query = supabase
      .from("memberships")
      .select("org_id, role")
      .eq("user_id", user.id);
    if (targetOrgId) {
      query = query.eq("org_id", targetOrgId);
    }
    const { data: memberships, error: membershipError } = await query.limit(1);
    if (!membershipError && memberships && memberships.length > 0) {
      org = { id: memberships[0].org_id, role: memberships[0].role };
    }
  } catch (e) {
    return { ctx: null, requiresAuth: false, error: new ApiError("Unauthorized: No organization membership", 403) };
  }

  if (!org) {
    return { ctx: null, requiresAuth: false, error: new ApiError("Unauthorized: No organization membership", 403) };
  }

  return {
    ctx: {
      requestId,
      userId: user.id,
      orgId: org.id,
      user,
      org,
      permissions: [org.role],
      rateLimitBudget: 1000,
      startTime,
    },
    requiresAuth: false,
  };
});
