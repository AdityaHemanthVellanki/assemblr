
import { assertNoMocks, assertRealRuntime } from "../lib/core/guard";

async function run() {
  assertRealRuntime();
  assertNoMocks();
  const userId = process.env.E2E_TEST_USER_ID;
  const orgId = process.env.E2E_TEST_ORG_ID;
  if (!userId || !orgId) {
    throw new Error("E2E_TEST_USER_ID and E2E_TEST_ORG_ID must be set for E2E verification.");
  }
  console.log("This script requires a full live flow. Use scripts/test-e2e-real.ts with real credentials.");
}

run();
