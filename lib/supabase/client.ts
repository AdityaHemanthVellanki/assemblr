import { createBrowserClient } from "@supabase/ssr";

// We access env vars directly via process.env because lib/env.ts might be server-only
// or not exporting what we need for the client in the way we want.
// However, typically we should use the validated env if possible.
// Given the instruction to use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, we will use it.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing Supabase client environment variables");
}

export function createSupabaseClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
}
