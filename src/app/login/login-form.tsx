"use client";

import { useActionState } from "react";
import { requestLoginLink } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(requestLoginLink, undefined);

  if (state?.sent) {
    return (
      <p>
        Check your email for a sign-in link. It expires in 15 minutes.
        <span className="muted"> In development, the link is printed in the server console.</span>
      </p>
    );
  }

  return (
    <form action={action} className="stack">
      <label>
        Email address
        <input name="email" type="email" required autoComplete="email" autoFocus />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <div>
        <button className="primary" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </div>
    </form>
  );
}
