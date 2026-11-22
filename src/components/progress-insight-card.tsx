import { connection } from "next/server";

import { formatDate, formatTimeAgo } from "@/lib/format";
import { MIN_ASSESSMENTS, progressInsightState } from "@/lib/progress-insight";

/**
 * The dashboard's "Coach's insight" card: the speaker's stored progress insight and when it was
 * updated, or why there isn't one yet. Reads the database, so render it inside <Suspense>.
 */
export async function ProgressInsightCard({ userId }: { userId: string }) {
  const { assessed, insight } = await progressInsightState(userId);
  await connection(); // "Updated …" is relative to the request's time.

  return (
    <section className="card progress-insight" aria-labelledby="progress-insight-heading">
      <h2 id="progress-insight-heading">Coach&apos;s insight</h2>
      {assessed < MIN_ASSESSMENTS ? (
        <p className="muted">Your coach&apos;s insight appears after two assessed practices.</p>
      ) : insight ? (
        <>
          <p className="progress-insight-text">{insight.text}</p>
          <p className="muted">
            Updated{" "}
            <time dateTime={insight.generatedAt.toISOString()} title={formatDate(insight.generatedAt)}>
              {formatTimeAgo(insight.generatedAt)}
            </time>
          </p>
        </>
      ) : (
        <p className="muted">Your coach&apos;s insight appears after your next practice.</p>
      )}
    </section>
  );
}
