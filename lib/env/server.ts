import "server-only";

import { z } from "zod";

const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),

    DATABASE_URL: z.string().min(1),
    NEXTAUTH_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(1),

    GITHUB_ID: z.string().min(1).optional(),
    GITHUB_SECRET: z.string().min(1).optional(),

    EMAIL_FROM: z.string().min(1).optional(),
    EMAIL_SERVER: z.string().min(1).optional(),

    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    const isProd = env.NODE_ENV === "production";
    if (isProd && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required in production",
      });
    }
  });

let cachedEnv: z.infer<typeof serverEnvSchema> | undefined;

export function getServerEnv() {
  cachedEnv ??= serverEnvSchema.parse(process.env);
  return cachedEnv;
}
