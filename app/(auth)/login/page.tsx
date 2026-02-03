"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        throw new Error("NEXT_PUBLIC_APP_URL is not defined");
      }

      const next =
        searchParams.get("returnTo") || searchParams.get("next") || "/app/chat";
      // Use window.location.origin to ensure redirects stay on the same domain (localhost vs ngrok)
      const redirectTo = new URL(`${window.location.origin}/auth/callback`);
      redirectTo.searchParams.set("next", next);

      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectTo.toString(),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.5),_transparent_60%)]" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/30 bg-background/80 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <span className="text-lg font-semibold">Assemblr</span>
          </Link>
        </nav>
      </header>

      {/* Main content */}
      <div className="flex min-h-screen items-center justify-center px-4 pt-20">
        <div className="w-full max-w-md">
          {/* Glass card container */}
          <div className="relative rounded-2xl border border-border/60 bg-background/50 p-8 backdrop-blur-xl shadow-[0_16px_40px_rgba(8,10,25,0.35)]">
            {/* Subtle glow effect */}
            <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-blue-500/5 via-transparent to-indigo-500/5" />

            <div className="space-y-6">
              {/* Header */}
              <div className="text-center space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Welcome to Assemblr
                </h1>
                <p className="text-sm text-muted-foreground">
                  Sign in to start building with AI
                </p>
              </div>

              {/* Error state */}
              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Sign in button */}
              <Button
                className="w-full h-11 rounded-xl text-sm font-medium"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="currentColor"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      />
                      <path
                        fill="currentColor"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      />
                    </svg>
                    Continue with Google
                  </>
                )}
              </Button>

              {/* Footer text */}
              <p className="text-center text-xs text-muted-foreground">
                By continuing, you agree to our{" "}
                <Link
                  href="/terms"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </Link>
              </p>
            </div>
          </div>

          {/* Additional info */}
          <p className="mt-6 text-center text-xs text-muted-foreground/60">
            Enterprise-grade AI tools for your team
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="dark flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
