import Link from "next/link";
import { Suspense } from "react";
import { verifyLoginLink } from "@/app/actions";

export default function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  return (
    <Suspense fallback={null}>
      <Verify searchParams={searchParams} />
    </Suspense>
  );
}

// Signing in happens on a button press rather than on page load, so email
// link scanners that prefetch the URL can't use up the single-use token.
async function Verify({ searchParams }: Pick<PageProps<"/auth/verify">, "searchParams">) {
  const { token } = await searchParams;

  if (typeof token !== "string" || !token) {
    return (
      <div className="card stack">
        <h1>Sign-in link missing</h1>
        <Link href="/login">Request a new link</Link>
      </div>
    );
  }

  return (
    <form action={verifyLoginLink} className="card stack">
      <h1>Finish signing in</h1>
      <input type="hidden" name="token" value={token} />
      <div>
        <button className="primary">Sign in to Chittle</button>
      </div>
    </form>
  );
}
