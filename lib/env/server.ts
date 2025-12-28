import "server-only";

import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),

    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

    GITHUB_ID: z.string().min(1).optional(),
    GITHUB_SECRET: z.string().min(1).optional(),

    EMAIL_FROM: z.string().min(1).optional(),
    EMAIL_SERVER: z.string().min(1).optional(),

    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).optional(),

    DATA_ENCRYPTION_KEY: z.string().min(1),
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
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}
