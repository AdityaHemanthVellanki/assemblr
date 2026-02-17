import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { assertNoMocks, ensureRuntimeOrThrow } from "@/lib/core/guard";

export async function bootstrapRealUserSession() {
  ensureRuntimeOrThrow();
  assertNoMocks();
  const env = getServerEnv();
  
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error("🚨 E2E_TEST_USER_EMAIL and E2E_TEST_USER_PASSWORD must be set in .env.local to run real auth tests.");
  }

  console.log(`[AuthBootstrap] Authenticating as ${email}...`);

  // Use a fresh client for auth
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false, // We handle session manually
      autoRefreshToken: false,
    }
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    throw new Error(`[AuthBootstrap] Failed to sign in: ${error?.message}`);
  }

  const user = data.user;
  console.log(`[AuthBootstrap] Authenticated as User ID: ${user.id}`);

  // Fetch Org ID (Membership)
  // We use the admin client to verify membership and enforce real org presence.
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();

  const { data: profile, error: profileError } = await (admin.from("profiles") as any)
    .select("id")
    .eq("id", user.id)
    .single();
  if (profileError || !profile) {
    throw new Error(`[AuthBootstrap] User profile missing in public.profiles for ${user.id}`);
  }

  const { data: memberships, error: memberError } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id);

  if (memberError || !memberships || memberships.length === 0) {
      throw new Error(`[AuthBootstrap] User ${user.id} has no organization membership`);
  }

  // Pick the first one (Stable)
  // Ideally we pick one with integrations connected, but that requires a join which might be slow or complex here.
  // Let's just pick the first one and log it.
  const orgId = memberships[0].org_id;
  console.log(`[AuthBootstrap] Found ${memberships.length} memberships. Using Org ID: ${orgId}`);

  return {
    session: data.session,
    user: user,
    orgId: orgId
  };
}
