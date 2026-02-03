import "@/lib/env";
import { validateRuntimeConfig } from "@/lib/core/guard";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
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
  }
}
