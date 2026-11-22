"use client";

import { useOptimistic, useState, useTransition } from "react";

import { setFocusVote } from "@/app/actions";
import type { FocusVote } from "@/db/schema";

const TOGGLES = [
  { vote: "up", label: "I want to work on this", glyph: "👍" },
  { vote: "down", label: "Not useful", glyph: "👎" },
] as const;

/**
 * Thumbs up and down focus votes on one area to improve. Clicking the active vote again clears it. The
 * toggles change straight away and go back to the stored vote if saving fails.
 */
export function FocusVoteToggles({ recordingId, area, vote }: { recordingId: string; area: string; vote: FocusVote | null }) {
  const [saved, setSaved] = useState(vote);
  const [shown, showVote] = useOptimistic(saved);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  const cast = (next: FocusVote | null) =>
    startTransition(async () => {
      showVote(next);
      // A dropped connection counts as a failed save too.
      const result = await setFocusVote(recordingId, area, next).catch(() => ({ error: "" }));
      startTransition(() => {
        setFailed("error" in result);
        if (!("error" in result)) setSaved(next);
      });
    });

  return (
    <div role="group" aria-label={area} className="focus-vote">
      {TOGGLES.map(({ vote: toggle, label, glyph }) => (
        <button
          key={toggle}
          type="button"
          className={`focus-vote-${toggle}`}
          aria-label={label}
          title={label}
          aria-pressed={shown === toggle}
          onClick={() => cast(shown === toggle ? null : toggle)}
        >
          <span aria-hidden="true">{glyph}</span>
        </button>
      ))}
      {failed && (
        <span role="alert" className="error">
          Couldn&apos;t save your vote. Try again.
        </span>
      )}
    </div>
  );
}
