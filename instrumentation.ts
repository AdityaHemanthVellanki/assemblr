import "@/lib/env";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Lazy validation only - do not validate at startup/build time
    // const { validateAzureDeployment } = await import("@/lib/ai/azureOpenAI");
    // await validateAzureDeployment();

    const { ensureSupabaseMemoryTables } = await import("@/lib/toolos/memory/supabase-memory");
    await ensureSupabaseMemoryTables();
  }
}
