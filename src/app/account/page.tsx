import { Suspense } from "react";
import { deleteAccount } from "@/app/actions";
import { requireUser } from "@/lib/auth/session";

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <Suspense fallback={null}>
      <Account searchParams={searchParams} />
    </Suspense>
  );
}

async function Account({ searchParams }: Pick<PageProps<"/account">, "searchParams">) {
  const user = await requireUser();
  const { error } = await searchParams;

  return (
    <div className="stack">
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>

      <form action={deleteAccount} className="card stack">
        <h2>Delete account</h2>
        <p className="muted">
          This permanently deletes your account, all of your recordings and their video files. It can&apos;t be
          undone.
        </p>
        <label>
          Type your email address to confirm
          <input name="confirm" autoComplete="off" required />
        </label>
        {error === "confirm" && <p className="error">That doesn&apos;t match your email address.</p>}
        <div>
          <button className="danger">Delete my account</button>
        </div>
      </form>
    </div>
  );
}
