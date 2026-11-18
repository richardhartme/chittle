import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { assessRecording } from "@/app/actions";
import { db } from "@/db";
import { assessments, recordings, topics, transcripts } from "@/db/schema";
import { DIMENSION_KEYS, type DimensionKey } from "@/lib/assessment/dimensions";
import { assessmentStateColumns, toAssessmentState, type AssessmentState } from "@/lib/assessment/status";
import { requireUser } from "@/lib/auth/session";
import { hasProviderKeys } from "@/lib/provider-keys";
import { formatDate, formatDuration } from "@/lib/format";
import { recordingMode } from "@/lib/practice";
import { AssessmentPoller } from "./assessment-poller";
import { DeleteForm } from "./delete-form";
import { DimensionCards } from "./dimension-cards";
import { OverallResult } from "./overall-result";
import { ScoreComposition } from "./score-composition";

export default function RecordingPage({ params }: PageProps<"/library/[id]">) {
  return (
    <Suspense fallback={null}>
      <Recording params={params} />
    </Suspense>
  );
}

async function Recording({ params }: Pick<PageProps<"/library/[id]">, "params">) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [row] = await db
    .select({ recording: recordings, topic: topics.text, assessment: assessmentStateColumns })
    .from(recordings)
    .innerJoin(topics, eq(topics.id, recordings.topicId))
    .leftJoin(assessments, eq(assessments.recordingId, recordings.id))
    .where(and(eq(recordings.id, id), eq(recordings.userId, user.id)));
  if (!row) notFound();

  const { recording, topic } = row;
  const assessment = toAssessmentState(row.assessment);
  const mode = recordingMode(recording.mimeType);
  const src = `/api/recordings/${recording.id}/file`;

  return (
    <div className="stack">
      <p>
        <Link href="/library">← Library</Link>
      </p>
      <h1>{topic}</h1>
      <p className="muted">
        {formatDate(recording.createdAt)} · {formatDuration(recording.durationSeconds)}
      </p>

      {mode === "audio" ? (
        <audio controls preload="metadata" src={src} />
      ) : (
        <video controls preload="metadata" src={src} />
      )}

      <AssessmentPanel
        recordingId={recording.id}
        userId={user.id}
        assessment={assessment}
        durationSeconds={recording.durationSeconds}
      />

      <DeleteForm recordingId={recording.id} />
    </div>
  );
}

async function AssessmentPanel({
  recordingId,
  userId,
  assessment,
  durationSeconds,
}: {
  recordingId: string;
  userId: string;
  assessment: AssessmentState;
  durationSeconds: number;
}) {
  if (assessment.status === "pending") {
    return (
      <section className="card" aria-live="polite">
        <p>Analysing…</p>
        <AssessmentPoller recordingId={recordingId} status="pending" />
      </section>
    );
  }

  if (assessment.status === "done") {
    const [row] = await db
      .select({
        transcript: transcripts.text,
        audioSeconds: transcripts.audioSeconds,
        total: assessments.totalScore,
        scores: {
          structure: assessments.structureScore,
          conciseness: assessments.concisenessScore,
          confidence: assessments.confidenceScore,
          pronunciation: assessments.pronunciationScore,
          fillerRate: assessments.fillerRateScore,
          pace: assessments.paceScore,
        },
        result: assessments.result,
      })
      .from(assessments)
      .leftJoin(transcripts, eq(transcripts.recordingId, assessments.recordingId))
      .where(eq(assessments.recordingId, recordingId));
    const judged = row?.result?.judged;
    return (
      <>
        {/* Assessments from before judging was added have no total or feedback. */}
        {judged && row.total !== null && <ScoreComposition total={row.total} scores={scoredOf(row.scores)} />}
        {/* Assessments from before measuring was added have no result. */}
        {row?.result && (
          <DimensionCards
            scores={row.scores}
            measured={row.result.measured}
            judged={judged}
            // The rates per minute were worked out from the transcript's length, so the duration shown beside them is too.
            durationSeconds={row.audioSeconds ?? durationSeconds}
          />
        )}
        {judged && (
          <OverallResult overview={judged.overview} strengths={judged.strengths} areasToImprove={judged.areasToImprove} />
        )}
        <section className="card stack">
          <h2>Transcript</h2>
          <p>{row?.transcript ?? "No transcript was stored."}</p>
        </section>
      </>
    );
  }

  const keysLink = (
    <p>
      <Link href="/account">Add your provider keys to get feedback</Link>
    </p>
  );
  const canAssess = await hasProviderKeys(userId);
  const startButton = (label: string) => (
    <form action={assessRecording}>
      <input type="hidden" name="recordingId" value={recordingId} />
      <button>{label}</button>
    </form>
  );

  if (assessment.status === "failed") {
    return (
      <section className="card stack" aria-live="polite">
        <p className="error">{assessment.error}</p>
        {canAssess ? startButton("Retry") : keysLink}
      </section>
    );
  }

  return (
    <section className="card stack">
      <p className="muted">Not assessed</p>
      {canAssess ? startButton("Assess") : keysLink}
    </section>
  );
}

/** Judged assessments have every dimension's score. */
function scoredOf(scores: Record<DimensionKey, number | null>): Record<DimensionKey, number> {
  return Object.fromEntries(DIMENSION_KEYS.map((key) => [key, scores[key] ?? 0])) as Record<DimensionKey, number>;
}
