import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase client environment variables");
    // We return a dummy client or throw lazily here. 
    // Throwing here is better than returning a broken client that fails later with obscure errors.
    // But since this is inside the function, it won't crash the app on load.
    throw new Error("Missing Supabase client environment variables");
  }

  return createBrowserClient(
    supabaseUrl,
    supabaseAnonKey
  );
}
