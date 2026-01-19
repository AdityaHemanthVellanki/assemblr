
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

export async function bootstrapRealUserSession() {
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
  // We need to use the admin client or the authenticated client to query memberships
  // But since we just signed in, we can use the `supabase` client with the returned session access token?
  // `signInWithPassword` sets the session on the client instance automatically?
  // Let's verify. Yes, mostly. But let's use the access token explicitly if needed.
  
  // Actually, we can use the admin client to look up the org for this user to be safe and robust
  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();

  // Check if public.users exists and has the user
  // We handle both 'users' and 'profiles' table names for compatibility
  let userTableName = "users";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: publicUser, error: publicUserError } = await (admin.from(userTableName as any) as any)
    .select("id")
    .eq("id", user.id)
    .single();

  if (publicUserError && publicUserError.code === '42P01') {
      userTableName = "profiles";
      console.warn(`[AuthBootstrap] Table 'users' not found, switching to '${userTableName}'`);
  }

  if (publicUserError || !publicUser) {
      console.warn(`[AuthBootstrap] User ${user.id} missing in public.${userTableName}. Attempting to sync...`);
      try {
           const userData = { 
               id: user.id, 
               email: user.email,
               // updated_at: new Date().toISOString() // Removed to avoid schema cache issues
           };
           
           // Use upsert to be safe
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           let { error: syncError } = await (admin.from(userTableName as any) as any).upsert(userData);
           
           if (syncError && syncError.code === '42P01' && userTableName === "users") {
               // Double check fallback if not caught above
               userTableName = "profiles";
               console.warn(`[AuthBootstrap] Table 'users' not found (in sync), switching to '${userTableName}'`);
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               const res = await (admin.from(userTableName as any) as any).upsert(userData);
               syncError = res.error;
           }

           if (syncError) {
               console.error(`Failed to sync public.${userTableName}:`, syncError);
           }
           else console.log(`✅ Synced public.${userTableName}`);
       } catch (e) {
          console.error(`Error syncing public.${userTableName}:`, e);
      }
  }

  const { data: memberships, error: memberError } = await admin
    .from("memberships")
    .select("org_id")
    .eq("user_id", user.id);

  if (memberError || !memberships || memberships.length === 0) {
      console.warn(`[AuthBootstrap] User ${user.id} has no organization (Memberships: ${JSON.stringify(memberships)}). Creating one...`);
      if (memberError) console.error("Membership fetch error:", memberError);

      // Auto-provision if missing (Test Robustness)
      // Handle 'orgs' vs 'organizations'
      let orgTableName = "orgs";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let { data: org, error: orgError } = await (admin.from(orgTableName as any) as any).insert({ name: "E2E Test Org" }).select("id").single();
      
      if (orgError && orgError.code === '42P01') {
          orgTableName = "organizations";
          console.warn(`[AuthBootstrap] Table 'orgs' not found, switching to '${orgTableName}'`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const res = await (admin.from(orgTableName as any) as any).insert({ name: "E2E Test Org" }).select("id").single();
          org = res.data;
          orgError = res.error;
      }

      if (orgError || !org) throw new Error(`Failed to create test org: ${orgError?.message}`);
      
      const { error: insertError } = await admin.from("memberships").insert({ user_id: user.id, org_id: org.id, role: "owner" });
      if (insertError) throw new Error(`Failed to insert membership: ${insertError.message}`);
      
      console.log(`[AuthBootstrap] Created new Org: ${org.id} in table ${orgTableName}`);
      return {
          session: data.session,
          user: user,
          orgId: org.id
      };
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
