
// import "server-only";

const FORBIDDEN_TERMS = [
  "mock",
  "fixture",
  "stub",
  "fake",
  "dummy",
  "test-token",
  "example-key",
  "nock",
  "msw",
  "sinon"
];

const FORBIDDEN_ENV_PREFIXES = [
  "TEST_",
  "MOCK_"
];

export function assertNoMocks() {
  if (process.env.NODE_ENV === "production") {
    // Check Environment Variables
    const envKeys = Object.keys(process.env);
    for (const key of envKeys) {
      if (FORBIDDEN_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) {
        throw new Error(`🚨 SECURITY VIOLATION: Forbidden environment variable detected: ${key}`);
      }
      
      const value = process.env[key] || "";
      if (FORBIDDEN_TERMS.some(term => value.toLowerCase().includes(term))) {
         // Exception for some legitimate uses if strictly needed, but generally no.
         // e.g. "facebook" contains "fake" -> no it doesn't.
         // "dummy" might be in a URL?
         // We will be strict.
         // Actually, let's just check the keys for now to avoid false positives in random standard env vars.
      }
    }
  }

  // We can't easily scan the whole module graph at runtime in Node.js without heavy tooling.
  // But we can check specific critical paths or rely on the build-time grep.
  // This function acts as a runtime gate.
  
  // Check for specific known testing frameworks globals
  if ((global as any).jest || (global as any).describe || (global as any).it || (global as any).afterEach) {
      if (process.env.NODE_ENV === "production") {
          throw new Error("🚨 SECURITY VIOLATION: Test runner detected in production");
      }
  }
}
