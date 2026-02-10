import "@/lib/env";
import { validateRuntimeConfig } from "@/lib/core/guard";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const runtimeResult = validateRuntimeConfig();
      if (!runtimeResult.ok) {
        if (process.env.NODE_ENV === "development") {
          console.error(runtimeResult.error);
          return;
        }
        throw new Error(runtimeResult.error);
      }
      if (runtimeResult.runtimeEnv === "DEV_WITH_REAL_CREDS") {
        console.warn("Skipping infra boot checks in DEV_WITH_REAL_CREDS. Memory tables will be validated at runtime.");
        return;
      }
      const { ensureSupabaseMemoryTables } = await import("@/lib/toolos/memory/supabase-memory");
      await ensureSupabaseMemoryTables();
    } catch (err) {
      console.error("Critical error during instrumentation register:", err);
      // Do not rethrow in production to avoid crashing the entire app
      if (process.env.NODE_ENV === "development") {
        throw err;
      }
    }
  }
}
