"use client";

import * as React from "react";
import Link from "next/link";
import { Github } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [status, setStatus] = React.useState<
    | { kind: "idle" }
    | { kind: "sent" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const router = useRouter();

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setStatus({ kind: "error", message: "Passwords do not match" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setStatus({
          kind: "error",
          message: typeof data?.error === "string" ? data.error : "Signup failed",
        });
        return;
      }

      if (data?.session?.ok) {
        router.push("/dashboard");
        router.refresh();
        return;
      }

      setStatus({ kind: "sent" });
    } finally {
      setIsLoading(false);
    }
  }

  async function onGithub() {
    setIsLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        "/dashboard",
      )}`;
      const res = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo },
      });
      if (res.error) setStatus({ kind: "error", message: res.error.message });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign up</CardTitle>
        <CardDescription>Create your Assemblr workspace.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.kind === "error" ? (
          <div className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
            {status.message}
          </div>
        ) : null}

        {status.kind === "sent" ? (
          <div className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
            Check your email to confirm your account.
          </div>
        ) : null}

        <form onSubmit={onEmailSubmit} className="space-y-2">
          <Input
            name="email"
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <Input
            name="password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Input
            name="confirmPassword"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Button className="w-full" disabled={isLoading}>
            Create account
          </Button>
        </form>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-border" />
          <div className="text-xs text-muted-foreground">or</div>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onGithub}
          disabled={isLoading}
        >
          <Github />
          Continue with GitHub
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-4"
          >
            Log in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
