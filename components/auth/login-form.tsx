"use client";

import * as React from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginForm({ error }: { error?: string }) {
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signIn("email", { email, callbackUrl: "/dashboard" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Sign in to access your organization workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-md border border-border bg-accent px-3 py-2 text-sm">
            Authentication error. Try again.
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
          <Button className="w-full" disabled={isLoading}>
            Continue with email
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
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
        >
          <Github />
          Continue with GitHub
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          No account yet?{" "}
          <Link
            href="/signup"
            className="text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
