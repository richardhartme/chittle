import { Suspense } from "react";
import { deleteAccount } from "@/app/actions";
import { requireUser } from "@/lib/auth/session";
import { getProviderKeyHints, providerDetails, providers } from "@/lib/provider-keys";
import { ProviderKeyForm } from "./provider-key-form";

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
  const hints = await getProviderKeyHints(user.id);

  return (
    <div className="stack">
      <h1>Account</h1>
      <p>
        Signed in as <strong>{user.email}</strong>
      </p>

      <section className="card stack">
        <h2>Provider keys</h2>
        <p className="muted">
          Recordings are assessed using your own keys, so you pay the providers directly. Create them in the{" "}
          <a href={providerDetails.deepgram.keysUrl} target="_blank" rel="noreferrer">
            Deepgram console
          </a>{" "}
          and the{" "}
          <a href={providerDetails.anthropic.keysUrl} target="_blank" rel="noreferrer">
            Claude Console
          </a>
          .
        </p>
        {providers.map((provider) => (
          <ProviderKeyForm
            key={provider}
            provider={provider}
            label={providerDetails[provider].label}
            hint={hints[provider] ?? null}
          />
        ))}
      </section>

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
