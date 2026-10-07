import Link from "next/link";
import { logout } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth/session";

/** Signed-in navigation. Reads the session cookie, so render it inside <Suspense>. */
export async function SiteNav() {
  if (!(await getCurrentUser())) return null;

  return (
    <nav>
      <Link href="/practice">Practise</Link>
      <Link href="/library">Library</Link>
      <Link href="/account">Account</Link>
      <form action={logout}>
        <button className="link-button">Sign out</button>
      </form>
    </nav>
  );
}
