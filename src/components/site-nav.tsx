import Link from "next/link";

import { logout } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth/session";

import { NavMenu } from "./nav-menu";
import { ThemeToggle } from "./theme-toggle";

/** Signed-in navigation. Reads the session cookie, so render it inside <Suspense>. */
export async function SiteNav() {
  if (!(await getCurrentUser())) return null;

  return (
    <NavMenu>
      <Link href="/">Home</Link>
      <Link href="/practice">Practise</Link>
      <Link href="/library">Library</Link>
      <Link href="/account">Account</Link>
      <form action={logout}>
        <button className="link-button">Sign out</button>
      </form>
      {/* The menu's own theme button, for narrow screens, where the header's one is hidden. */}
      <ThemeToggle labelled />
    </NavMenu>
  );
}
