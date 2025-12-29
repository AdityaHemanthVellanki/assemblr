import "server-only";

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

    GITHUB_ID: optionalString(),
    GITHUB_SECRET: optionalString(),

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
    if (isProd && !env.NEXT_PUBLIC_SITE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NEXT_PUBLIC_SITE_URL"],
        message: "NEXT_PUBLIC_SITE_URL is required in production",
      });
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
