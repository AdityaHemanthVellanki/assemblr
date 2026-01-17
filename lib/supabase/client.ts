"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

let browserClient: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !publishableKey) {
      throw new Error("Supabase is not configured");
    }
    browserClient = createBrowserClient<Database>(url, publishableKey);
  }
  return browserClient;
}

export function createSupabaseBrowserClient() {
  return getSupabaseBrowserClient();
}
