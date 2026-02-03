
// import "server-only";

const FORBIDDEN_TERMS = [
  "mock",
  "fixture",
  "stub",
  "fake",
  "dummy",
  "test-token",
  "example-key",
  "example_token",
  "placeholder",
  "nock",
  "msw",
  "sinon"
];

const FORBIDDEN_ENV_PREFIXES = [
  "TEST_",
  "MOCK_",
  "DUMMY_",
  "FAKE_"
];

export function assertNoMocks(env?: NodeJS.ProcessEnv) {
  const processEnv = env ?? process.env;
  const envKeys = Object.keys(processEnv);
  for (const key of envKeys) {
    if (FORBIDDEN_ENV_PREFIXES.some(prefix => key.startsWith(prefix))) {
      throw new Error(`🚨 SECURITY VIOLATION: Forbidden environment variable detected: ${key}`);
    }
    const value = processEnv[key] || "";
    if (FORBIDDEN_TERMS.some(term => value.toLowerCase().includes(term))) {
      throw new Error(`🚨 SECURITY VIOLATION: Forbidden dummy/mock value detected in env: ${key}`);
    }
  }

  if ((global as any).jest || (global as any).describe || (global as any).it || (global as any).afterEach) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("🚨 SECURITY VIOLATION: Test runner detected in production");
    }
  }
}

export function assertRealRuntime(env?: NodeJS.ProcessEnv) {
  const processEnv = env ?? process.env;
  const runtimeEnv = processEnv.RUNTIME_ENV;
  if (!runtimeEnv) {
    throw new Error("🚨 RUNTIME_ENV is required. Allowed: REAL_RUNTIME, DEV_WITH_REAL_CREDS, TEST_WITH_REAL_CREDS.");
  }
  if (!["REAL_RUNTIME", "DEV_WITH_REAL_CREDS", "TEST_WITH_REAL_CREDS"].includes(runtimeEnv)) {
    throw new Error(`🚨 Invalid RUNTIME_ENV "${runtimeEnv}". Allowed: REAL_RUNTIME, DEV_WITH_REAL_CREDS, TEST_WITH_REAL_CREDS.`);
  }
}
