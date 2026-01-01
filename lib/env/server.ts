

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

    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),

    NEXT_PUBLIC_SITE_URL: optionalUrl(),
    APP_BASE_URL: z.string().url(),

    // OAuth Credentials (MANDATORY)
    // These credentials come from the respective provider developer dashboards (e.g. GitHub OAuth Apps).
    // Users NEVER supply these; they are platform-level secrets.
    // If these are missing, the deployment is misconfigured and OAuth will fail fast.
    GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required for OAuth"),
    GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required for OAuth"),

    SLACK_CLIENT_ID: z.string().min(1, "SLACK_CLIENT_ID is required for OAuth"),
    SLACK_CLIENT_SECRET: z.string().min(1, "SLACK_CLIENT_SECRET is required for OAuth"),

    NOTION_CLIENT_ID: z.string().min(1, "NOTION_CLIENT_ID is required for OAuth"),
    NOTION_CLIENT_SECRET: z.string().min(1, "NOTION_CLIENT_SECRET is required for OAuth"),

    LINEAR_CLIENT_ID: z.string().min(1, "LINEAR_CLIENT_ID is required for OAuth"),
    LINEAR_CLIENT_SECRET: z.string().min(1, "LINEAR_CLIENT_SECRET is required for OAuth"),

    GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required for OAuth"),
    GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required for OAuth"),

    EMAIL_FROM: optionalString(),
    EMAIL_SERVER: optionalString(),

    AZURE_OPENAI_ENDPOINT: optionalUrl(),
    AZURE_OPENAI_API_KEY: optionalString(),
    AZURE_OPENAI_DEPLOYMENT_NAME: optionalString(),
    AZURE_OPENAI_API_VERSION: z.preprocess(
      emptyToUndefined,
      z.string().min(1).default("2024-02-15-preview"),
    ),

    DATA_ENCRYPTION_KEY: optionalString(),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === "production";
    const isProdBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
    if (isProd && !env.NEXT_PUBLIC_SITE_URL) {
      if (isProdBuildPhase) return;
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SITE_URL"],
        message: "NEXT_PUBLIC_SITE_URL is required in production",
      });
    }
    if (!env.DATA_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATA_ENCRYPTION_KEY"],
        message: "DATA_ENCRYPTION_KEY is required",
      });
    }
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
