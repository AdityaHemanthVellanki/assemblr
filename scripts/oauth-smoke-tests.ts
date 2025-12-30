import { OAUTH_PROVIDERS } from "@/lib/integrations/oauthProviders";
import { encryptJson, decryptJson } from "@/lib/security/encryption";
import { getValidAccessToken } from "@/lib/integrations/tokenRefresh";

// Mock environment for encryption
process.env.DATA_ENCRYPTION_KEY = "test-key-32-chars-exactly-for-aes-256-gcm-!";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY = "test-pub-key";
process.env.SUPABASE_SECRET_KEY = "test-secret-key";

async function runTests() {
  console.log("Running OAuth Infrastructure Smoke Tests...\n");

  // 1. Registry Integrity
  console.log("1. Verifying OAuth Registry...");
  const providers = Object.values(OAUTH_PROVIDERS);
  if (providers.length === 0) throw new Error("Registry empty");
  
  for (const p of providers) {
    if (!p.id || !p.name || !p.authUrl || !p.tokenUrl || !p.clientIdEnv || !p.clientSecretEnv) {
      throw new Error(`Invalid provider config: ${p.id}`);
    }
  }
  console.log(`   OK: ${providers.length} providers verified.`);

  // 2. Encryption Round-Trip
  console.log("\n2. Verifying Encryption...");
  const original = { foo: "bar", nested: { baz: 123 } };
  const encrypted = encryptJson(original);
  const decrypted = decryptJson(encrypted);
  if (JSON.stringify(original) !== JSON.stringify(decrypted)) {
    throw new Error("Encryption round-trip failed");
  }
  console.log("   OK: Encryption round-trip successful.");

  // 3. Refresh Logic Presence
  console.log("\n3. Verifying Refresh Logic Structure...");
  if (typeof getValidAccessToken !== "function") {
    throw new Error("getValidAccessToken not exported");
  }
  console.log("   OK: Refresh logic exported.");

  console.log("\nAll infrastructure checks passed.");
}

runTests().catch((e) => {
  console.error("Test Failed:", e);
  process.exit(1);
});
