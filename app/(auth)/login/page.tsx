"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  scaleIn,
  staggerContainer,
  staggerItem,
  fadeIn,
} from "@/lib/ui/motion";

function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const next = searchParams.get("returnTo") || searchParams.get("next") || "/app";
      router.push(next);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      if (!appUrl) {
        throw new Error("NEXT_PUBLIC_APP_URL is not defined");
      }

      const next =
        searchParams.get("returnTo") || searchParams.get("next") || "/app";

      const origin = window.location.origin;
      const redirectTo = new URL(`${origin}/auth/callback`);
      redirectTo.searchParams.set("next", next);

      console.log("[Login] Redirecting to:", redirectTo.toString());

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
      {/* Background gradient with breathing animation */}
      <div className="absolute inset-0 -z-10 breathing-bg bg-[radial-gradient(circle_at_top,_rgba(30,41,59,0.5),_transparent_60%)]" />

      {/* Decorative blur orbs */}
      <div className="absolute top-1/4 -left-32 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

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
          {/* Glass card container with entrance animation */}
          <motion.div
            variants={scaleIn}
            initial="hidden"
            animate="visible"
            className="relative rounded-2xl border border-border/60 bg-background/50 p-8 backdrop-blur-xl shadow-[0_16px_40px_rgba(8,10,25,0.35)]"
          >
            {/* Subtle glow effect */}
            <div className="absolute inset-0 -z-10 rounded-2xl bg-gradient-to-br from-blue-500/5 via-transparent to-indigo-500/5" />

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="space-y-6"
            >
              {/* Header */}
              <motion.div variants={staggerItem} className="text-center space-y-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Welcome to Assemblr
                </h1>
                <p className="text-sm text-muted-foreground">
                  Sign in to start building with AI
                </p>
              </motion.div>

              {/* Error state */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                      {error}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email/Password Form */}
              <motion.form variants={staggerItem} onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-background/50"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
                </Button>
              </motion.form>

              <motion.div variants={staggerItem} className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </motion.div>

              {/* Sign in button */}
              <motion.div variants={staggerItem}>
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl text-sm font-medium"
                  onClick={handleLogin}
                  disabled={loading}
                >
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
                </Button>
              </motion.div>

              {/* Footer text */}
              <motion.p
                variants={fadeIn}
                initial="hidden"
                animate="visible"
                custom={0.5}
                className="text-center text-xs text-muted-foreground"
              >
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
              </motion.p>
            </motion.div>
          </motion.div>

          {/* Additional info */}
          <motion.p
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            custom={0.6}
            className="mt-6 text-center text-xs text-muted-foreground/60"
          >
            Enterprise-grade AI tools for your team
          </motion.p>
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
