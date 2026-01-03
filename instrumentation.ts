import "@/lib/env";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateAzureDeployment } = await import("@/lib/ai/azureOpenAI");
    await validateAzureDeployment();
  }
}
