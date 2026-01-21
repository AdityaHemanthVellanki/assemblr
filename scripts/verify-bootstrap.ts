
import { resolveBuildContext } from "../lib/toolos/build-context";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { randomUUID } from "crypto";

async function run() {
  console.log("🧪 Starting Bootstrap Verification...");

  const supabase = createSupabaseAdminClient();
  
  // 1. Create a mock user
  const email = `test-user-${randomUUID()}@example.com`;
  const password = "password123";
  
  console.log(`Creating test user: ${email}`);
  const { data: user, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError || !user.user) {
    console.error("Failed to create test user:", createError);
    process.exit(1);
  }

  const userId = user.user.id;
  console.log(`User created: ${userId}`);

  try {
    // Test 1: Resolve without org (should create default)
    console.log("\nTest 1: Resolve without orgId...");
    const ctx1 = await resolveBuildContext(userId);
    console.log("Context resolved:", ctx1);

    if (!ctx1.orgId) throw new Error("orgId missing");
    if (ctx1.ownerId !== userId) throw new Error("ownerId mismatch");

    // Verify org exists
    const { data: org1 } = await supabase.from("organizations").select("id").eq("id", ctx1.orgId).single();
    if (!org1) throw new Error(`Org ${ctx1.orgId} not found in DB`);
    console.log("✅ Default org verified");

    // Test 2: Resolve with specific NEW orgId (should create it)
    const targetOrgId = randomUUID();
    console.log(`\nTest 2: Resolve with specific missing orgId: ${targetOrgId}...`);
    const ctx2 = await resolveBuildContext(userId, targetOrgId);
    console.log("Context resolved:", ctx2);

    if (ctx2.orgId !== targetOrgId) throw new Error(`orgId mismatch: expected ${targetOrgId}, got ${ctx2.orgId}`);

    // Verify org exists
    const { data: org2 } = await supabase.from("organizations").select("id").eq("id", targetOrgId).single();
    if (!org2) throw new Error(`Org ${targetOrgId} not found in DB`);
    console.log("✅ Targeted org creation verified");

  } finally {
    // Cleanup
    console.log("\nCleaning up...");
    await supabase.auth.admin.deleteUser(userId);
    // Organizations might cascade delete if user is owner, but let's be safe.
    // Actually, we don't know the cascade rules, so we'll leave it or try to delete.
  }
  
  console.log("🎉 Verification Passed!");
}

run().catch(err => {
  console.error("❌ Verification Failed:", err);
  process.exit(1);
});
