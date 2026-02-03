import { z } from "zod";

function emptyToUndefined(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function optionalString() {
  return z.preprocess(emptyToUndefined, z.string().min(1).optional());
}

function optionalUrl() {
  return z.preprocess(emptyToUndefined, z.string().url().optional());
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    RUNTIME_ENV: z.enum(["REAL_RUNTIME", "DEV_WITH_REAL_CREDS", "TEST_WITH_REAL_CREDS"]),

    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),

    NEXT_PUBLIC_SITE_URL: z.string().url(),
    APP_BASE_URL: z.string().url(),

    // --------------------------------------------------------------------------
    // AI CONFIGURATION (MANDATORY)
    // --------------------------------------------------------------------------
    AZURE_OPENAI_ENDPOINT: z.string().url("AZURE_OPENAI_ENDPOINT is required").refine((url) => {
      try {
        const u = new URL(url);
        // Ensure strictly base URL (no path segments)
        return u.pathname === "/" || u.pathname === "";
      } catch {
        return false;
      }
    }, {
      message: "AZURE_OPENAI_ENDPOINT must be the base resource URL (e.g. https://resource.openai.azure.com). Do not include /openai or /v1 paths."
    }),
    AZURE_OPENAI_API_KEY: z.string().min(1, "AZURE_OPENAI_API_KEY is required"),
    AZURE_OPENAI_DEPLOYMENT_NAME: z.string().min(1, "AZURE_OPENAI_DEPLOYMENT_NAME is required"),
    AZURE_OPENAI_API_VERSION: z.string().refine((val) => val === "2024-08-01-preview", {
      message: "AZURE_OPENAI_API_VERSION must be exactly '2024-08-01-preview'",
    }),

    // --------------------------------------------------------------------------
    // OAUTH PROVIDERS (MANDATORY FOR PRODUCTION)
    // --------------------------------------------------------------------------
    // As per strict production-readiness directive, these are now REQUIRED.
    // The system will crash if any are missing.
    // --------------------------------------------------------------------------
    
    // GitHub
    GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
    GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),

    // Slack
    SLACK_CLIENT_ID: z.string().min(1, "SLACK_CLIENT_ID is required"),
    SLACK_CLIENT_SECRET: z.string().min(1, "SLACK_CLIENT_SECRET is required"),

    // Notion
    NOTION_CLIENT_ID: z.string().min(1, "NOTION_CLIENT_ID is required"),
    NOTION_CLIENT_SECRET: z.string().min(1, "NOTION_CLIENT_SECRET is required"),

    // Linear
    LINEAR_CLIENT_ID: z.string().min(1, "LINEAR_CLIENT_ID is required"),
    LINEAR_CLIENT_SECRET: z.string().min(1, "LINEAR_CLIENT_SECRET is required"),

    // Google
    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

    EMAIL_FROM: optionalString(),
    EMAIL_SERVER: optionalString(),

    DATA_ENCRYPTION_KEY: z.string().min(1, "DATA_ENCRYPTION_KEY is required"),
    
    CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),
  })
  .superRefine((env, ctx) => {
    if (env.APP_BASE_URL?.startsWith("http://")) {
      console.warn("⚠️  WARNING: APP_BASE_URL is using http://. OAuth providers (Slack, Notion, etc.) require HTTPS.");
    }
  });

let cachedEnv: z.infer<typeof serverEnvSchema> | undefined;

export function getServerEnv() {
  const raw = process.env;
  cachedEnv ??= serverEnvSchema.parse({
    ...raw,
  });
  return cachedEnv;
}
