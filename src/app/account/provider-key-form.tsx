"use client";

import { useActionState, useState } from "react";
import { removeProviderKey, saveProviderKey, type ProviderKeyState } from "@/app/actions";
import type { Provider } from "@/db/schema";

type Props = {
  provider: Provider;
  label: string;
  /** Last four characters of the saved key, or null if none is saved. The full key never reaches the client. */
  hint: string | null;
};

export function ProviderKeyForm({ provider, label, hint }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ProviderKeyState, formData: FormData) => {
    const result = await saveProviderKey(prev, formData);
    if (result?.saved) setEditing(false);
    return result;
  }, undefined);

  if (hint && !editing) {
    return (
      <div className="provider-key stack">
        <h3>{label}</h3>
        <p>
          Saved, ending in <strong>{hint}</strong>
        </p>
        <div className="row">
          <button type="button" onClick={() => setEditing(true)}>
            Replace
          </button>
          <form action={removeProviderKey}>
            <input type="hidden" name="provider" value={provider} />
            <button className="danger">Remove</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="provider-key stack">
      <h3>{label}</h3>
      <input type="hidden" name="provider" value={provider} />
      <label>
        {label} key
        <input name="key" type="password" autoComplete="off" spellCheck={false} required />
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      <div className="row">
        <button className="primary" disabled={pending}>
          {pending ? "Checking…" : "Save"}
        </button>
        {hint && (
          <button type="button" className="link-button" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
