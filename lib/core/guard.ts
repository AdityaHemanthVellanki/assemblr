
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

export type RuntimeValidationResult =
  | { ok: true; runtimeEnv: "REAL_RUNTIME" | "DEV_WITH_REAL_CREDS" | "TEST_WITH_REAL_CREDS" }
  | { ok: false; error: string; runtimeEnv?: string };

let cachedRuntimeResult: RuntimeValidationResult | null = null;

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

export function validateRuntimeConfig(env?: NodeJS.ProcessEnv): RuntimeValidationResult {
  if (cachedRuntimeResult) return cachedRuntimeResult;
  const processEnv = env ?? process.env;
  const runtimeEnv = processEnv.RUNTIME_ENV;
  const devOverride = processEnv.ASSEMBLR_DEV_RUNTIME_ENV;
  const nodeEnv = processEnv.NODE_ENV ?? "development";
  const setResult = (result: RuntimeValidationResult) => {
    cachedRuntimeResult = result;
    return result;
  };

  if (!runtimeEnv && nodeEnv === "development") {
    if (devOverride === "DEV_WITH_REAL_CREDS") {
      return setResult({ ok: true, runtimeEnv: "DEV_WITH_REAL_CREDS" });
    }
    if (devOverride) {
      return setResult({
        ok: false,
        error: `🚨 Invalid ASSEMBLR_DEV_RUNTIME_ENV "${devOverride}". Allowed: DEV_WITH_REAL_CREDS.`,
        runtimeEnv: devOverride,
      });
    }
    return setResult({
      ok: false,
      error: "Assemblr requires explicit runtime configuration. Set RUNTIME_ENV=DEV_WITH_REAL_CREDS in .env.local.",
    });
  }

  if (!runtimeEnv) {
    return setResult({
      ok: false,
      error: "Assemblr requires explicit runtime configuration. Set RUNTIME_ENV=DEV_WITH_REAL_CREDS in .env.local.",
    });
  }

  if (!["REAL_RUNTIME", "DEV_WITH_REAL_CREDS", "TEST_WITH_REAL_CREDS"].includes(runtimeEnv)) {
    return setResult({
      ok: false,
      error: `🚨 Invalid RUNTIME_ENV "${runtimeEnv}". Allowed: REAL_RUNTIME, DEV_WITH_REAL_CREDS, TEST_WITH_REAL_CREDS.`,
      runtimeEnv,
    });
  }

  const resolvedRuntimeEnv = runtimeEnv as "REAL_RUNTIME" | "DEV_WITH_REAL_CREDS" | "TEST_WITH_REAL_CREDS";
  return setResult({ ok: true, runtimeEnv: resolvedRuntimeEnv });
}

export function ensureRuntimeOrThrow(env?: NodeJS.ProcessEnv) {
  const result = validateRuntimeConfig(env);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.runtimeEnv;
}

export function assertRealRuntime(env?: NodeJS.ProcessEnv) {
  return validateRuntimeConfig(env);
}

export function getRuntimeValidationResult() {
  return cachedRuntimeResult;
}
