import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const error =
    typeof searchParams.error === "string" ? searchParams.error : undefined;

  return (
    <Suspense>
      <LoginForm error={error} />
    </Suspense>
  );
}
