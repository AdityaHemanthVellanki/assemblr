import { z } from "zod";
import { validateRuntimeConfig } from "@/lib/core/guard";

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

function buildEnvErrorMessage(raw: NodeJS.ProcessEnv, issues: z.ZodIssue[]) {
  const lines = [
    "Assemblr requires explicit runtime configuration.",
    "Set RUNTIME_ENV=DEV_WITH_REAL_CREDS in .env.local.",
    "CRON_SECRET is required in REAL_RUNTIME and TEST_WITH_REAL_CREDS.",
  ];
  const invalidFields = Array.from(
    new Set(
      issues
        .map((issue) => issue.path.join("."))
        .filter((path) => path.length > 0),
    ),
  );
  if (invalidFields.length > 0) {
    lines.push(`Invalid or missing env: ${invalidFields.join(", ")}`);
  }
  return lines.join("\n");
}

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    RUNTIME_ENV: z.enum(["REAL_RUNTIME", "DEV_WITH_REAL_CREDS", "TEST_WITH_REAL_CREDS"]).optional(),

    SUPABASE_URL: z.string().url(),
    SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    SUPABASE_SECRET_KEY: z.string().min(1),

    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
    APP_BASE_URL: z.string().url().optional(),

    // --------------------------------------------------------------------------
    // AI CONFIGURATION (MANDATORY)
    // --------------------------------------------------------------------------
    AZURE_OPENAI_ENDPOINT: z.string().url().optional().refine((url) => {
      if (!url) return true;
      try {
        const u = new URL(url);
        return u.pathname === "/" || u.pathname === "";
      } catch {
        return false;
      }
    }, {
      message: "AZURE_OPENAI_ENDPOINT must be the base resource URL."
    }),
    AZURE_OPENAI_API_KEY: z.string().min(1).optional(),
    AZURE_OPENAI_DEPLOYMENT_NAME: z.string().min(1).optional(),
    AZURE_OPENAI_API_VERSION: z.string().optional().refine((val) => !val || val === "2024-08-01-preview", {
      message: "AZURE_OPENAI_API_VERSION must be '2024-08-01-preview'",
    }),

    // --------------------------------------------------------------------------
    // OAUTH PROVIDERS (MANDATORY FOR PRODUCTION)
    // --------------------------------------------------------------------------
    // As per strict production-readiness directive, these are now REQUIRED.
    // The system will crash if any are missing.
    // --------------------------------------------------------------------------

    // GitHub
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

    // Slack
    SLACK_CLIENT_ID: z.string().min(1).optional(),
    SLACK_CLIENT_SECRET: z.string().min(1).optional(),

    // Notion
    NOTION_CLIENT_ID: z.string().min(1).optional(),
    NOTION_CLIENT_SECRET: z.string().min(1).optional(),

    // Linear
    LINEAR_CLIENT_ID: z.string().min(1).optional(),
    LINEAR_CLIENT_SECRET: z.string().min(1).optional(),

    // Google
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    EMAIL_FROM: optionalString(),
    EMAIL_SERVER: optionalString(),

    DATA_ENCRYPTION_KEY: z.string().min(1).optional(),

    CRON_SECRET: optionalString(),

    // --------------------------------------------------------------------------
    // COMPOSIO CONFIGURATION
    // --------------------------------------------------------------------------
    COMPOSIO_API_KEY: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.APP_BASE_URL?.startsWith("http://")) {
      console.warn("⚠️  WARNING: APP_BASE_URL is using http://. OAuth providers (Slack, Notion, etc.) require HTTPS.");
    }
    if (env.NODE_ENV !== "development" && !env.RUNTIME_ENV) {
      console.warn("⚠️  WARNING: RUNTIME_ENV is missing in production. Defaulting to REAL_RUNTIME.");
    }
    if ((env.RUNTIME_ENV === "REAL_RUNTIME" || env.RUNTIME_ENV === "TEST_WITH_REAL_CREDS") && !env.CRON_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CRON_SECRET"],
        message: "CRON_SECRET is required for REAL_RUNTIME and TEST_WITH_REAL_CREDS",
      });
    }
  });

let cachedEnv: z.infer<typeof serverEnvSchema> | undefined;

export function getServerEnv() {
  const raw = process.env;
  if (cachedEnv) return cachedEnv;
  const runtimeResult = validateRuntimeConfig(raw);
  const runtimeEnv = runtimeResult.ok ? runtimeResult.runtimeEnv : raw.RUNTIME_ENV;
  const parseResult = serverEnvSchema.safeParse({
    ...raw,
    SUPABASE_PUBLISHABLE_KEY: raw.SUPABASE_PUBLISHABLE_KEY || raw.NEXT_PUBLIC_SUPABASE_ANON_KEY || raw.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    RUNTIME_ENV: runtimeEnv,
  });
  if (!parseResult.success) {
    throw new Error(buildEnvErrorMessage(raw, parseResult.error.issues));
  }
  const data = parseResult.data;

  // Default RUNTIME_ENV if missing outside development
  if (data.NODE_ENV === "production" && !data.RUNTIME_ENV) {
    (data as any).RUNTIME_ENV = "REAL_RUNTIME";
  }

  // Fallback for NEXT_PUBLIC_SITE_URL if missing
  if (!data.NEXT_PUBLIC_SITE_URL) {
    data.NEXT_PUBLIC_SITE_URL = data.APP_BASE_URL || (process.env.NEXT_PUBLIC_APP_URL as string);
  }

  cachedEnv = data;
  return cachedEnv;
}
