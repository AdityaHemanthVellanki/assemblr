import { resolveBuildContext } from "../lib/toolos/build-context";
import { createSupabaseAdminClient } from "../lib/supabase/admin";
import { assertNoMocks, assertRealRuntime } from "../lib/core/guard";

async function run() {
  assertRealRuntime();
  assertNoMocks();
  console.log("🧪 Starting Bootstrap Verification (Real Credentials Required)...");

  const supabase = createSupabaseAdminClient();
  
  const userId = process.env.E2E_TEST_USER_ID;
  const orgId = process.env.E2E_TEST_ORG_ID;
  if (!userId || !orgId) {
    throw new Error("E2E_TEST_USER_ID and E2E_TEST_ORG_ID must be set for bootstrap verification.");
  }

  try {
    console.log("\nTest: Resolve with explicit real orgId...");
    const ctx = await resolveBuildContext(userId, orgId);
    console.log("Context resolved:", ctx);

    if (ctx.orgId !== orgId) throw new Error(`orgId mismatch: expected ${orgId}, got ${ctx.orgId}`);
    if (ctx.ownerId !== userId) throw new Error("ownerId mismatch");

    const { data: org } = await supabase.from("organizations").select("id").eq("id", orgId).single();
    if (!org) throw new Error(`Org ${orgId} not found in DB`);
    console.log("✅ Org verified");
  } catch (err) {
    console.error("❌ Verification Failed:", err);
    process.exit(1);
  }

  console.log("🎉 Verification Passed!");
}

run().catch(err => {
  console.error("❌ Verification Failed:", err);
  process.exit(1);
});
