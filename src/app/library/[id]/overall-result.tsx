import type { FocusVote } from "@/db/schema";
import { FocusVoteToggles } from "./focus-vote";

/** The recording's overview, strengths and areas to improve, each area with its focus vote. */
export function OverallResult({
  recordingId,
  overview,
  strengths,
  areasToImprove,
  focusVotes,
}: {
  recordingId: string;
  overview: string;
  strengths: string[];
  areasToImprove: string[];
  focusVotes: Record<string, FocusVote>;
}) {
  return (
    <section className="card stack overall-result">
      <h2>Overview</h2>
      <p>{overview}</p>
      <div className="feedback-lists">
        <div>
          <h2 id="strengths">Strengths</h2>
          <ul aria-labelledby="strengths" className="strengths">
            {strengths.map((strength) => (
              <li key={strength}>
                <span aria-hidden="true">✓</span>
                {strength}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 id="areas-to-improve">Areas to improve</h2>
          <ul aria-labelledby="areas-to-improve" className="areas-to-improve">
            {areasToImprove.map((area) => (
              <li key={area}>
                <span>{area}</span>
                <FocusVoteToggles recordingId={recordingId} area={area} vote={focusVotes[area] ?? null} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
