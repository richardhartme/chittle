"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveRating, type FormState } from "@/app/actions";
import type { RecordingRating } from "@/db/schema";

const CRITERIA = [
  { name: "clarity", label: "Clarity" },
  { name: "confidence", label: "Confidence" },
  { name: "structure", label: "Structure" },
  { name: "pacing", label: "Pacing" },
  { name: "bodyLanguage", label: "Body language" },
] as const;

export function RatingForm({ recordingId, initial }: { recordingId: string; initial: RecordingRating | null }) {
  const [state, setState] = useState<FormState>();
  const [pending, startTransition] = useTransition();

  // Submitted via onSubmit rather than the form `action` prop: React resets
  // the form's fields after an action completes, which would wipe what the
  // user just saved.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => setState(await saveRating(undefined, formData)));
  }

  return (
    <form onSubmit={onSubmit} className="stack">
      <input type="hidden" name="recordingId" value={recordingId} />

      <div className="rating-grid">
        {CRITERIA.map(({ name, label }) => (
          <fieldset key={name} className="rating-row">
            <legend className="sr-only">{label}</legend>
            <span>{label}</span>
            <div className="rating-options">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name={name}
                    value={value}
                    required
                    defaultChecked={initial?.[name] === value}
                    onChange={() => setState(undefined)}
                  />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <label>
        Notes
        <textarea
          name="note"
          defaultValue={initial?.note ?? ""}
          maxLength={5000}
          onChange={() => setState(undefined)}
        />
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      {state?.saved && <p className="muted">Saved.</p>}
      <div>
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
