"use client";

import { useState } from "react";
import { assessRecording } from "@/app/actions";
import { SCORING_VERSION } from "@/lib/assessment/version";

/**
 * Near the foot of a recording's page, above Delete, once its assessment is done: labels one made with an older scoring version (or none recorded),
 * since re-assessing it adds newer features, and offers Re-assess behind an inline confirmation that
 * explains the cost.
 */
export function ReassessPanel({
  recordingId,
  scoringVersion,
  canReassess,
}: {
  recordingId: string;
  scoringVersion: number | null;
  canReassess: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const outdated = scoringVersion === null || scoringVersion < SCORING_VERSION;
  if (!outdated && !canReassess) return null;

  return (
    <section className="card stack" aria-label="Re-assess">
      {outdated && <p className="muted">Assessed with an older version</p>}
      {canReassess &&
        (confirming ? (
          <form action={assessRecording} className="stack">
            <input type="hidden" name="recordingId" value={recordingId} />
            <p>This re-runs the assessment on your Anthropic key and replaces the current results.</p>
            <div className="row">
              <button className="primary">Re-assess</button>
              <button type="button" className="link-button" onClick={() => setConfirming(false)} autoFocus>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div>
            <button type="button" onClick={() => setConfirming(true)}>
              Re-assess
            </button>
          </div>
        ))}
    </section>
  );
}
