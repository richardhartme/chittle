import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  if (await getCurrentUser()) redirect("/practice");
  const { error } = await searchParams;

  return (
    <div className="card stack">
      <h1>Sign in</h1>
      <p className="muted">No password needed. We&apos;ll email you a link. New here? It creates your account.</p>
      {error === "invalid" && (
        <p className="error">That sign-in link is invalid or has expired. Request a new one below.</p>
      )}
      <LoginForm />
    </div>
  );
}
