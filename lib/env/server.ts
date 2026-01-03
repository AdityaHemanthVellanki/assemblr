

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
    // OAUTH PROVIDERS (OPTIONAL AT STARTUP)
    // --------------------------------------------------------------------------
    // These are required only when a user attempts to connect the specific integration.
    // We allow the app to boot without them to simplify self-hosting and development.
    // --------------------------------------------------------------------------
    
    // GitHub
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),

    // Slack
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),

    // Notion
    NOTION_CLIENT_ID: z.string().optional(),
    NOTION_CLIENT_SECRET: z.string().optional(),

    // Linear
    LINEAR_CLIENT_ID: z.string().optional(),
    LINEAR_CLIENT_SECRET: z.string().optional(),

    // Google
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    EMAIL_FROM: optionalString(),
    EMAIL_SERVER: optionalString(),

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
