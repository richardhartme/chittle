import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { assessRecording } from "@/app/actions";
import { db } from "@/db";
import { assessments, recordings, topics, transcripts } from "@/db/schema";
import { assessmentStateColumns, toAssessmentState, type AssessmentState } from "@/lib/assessment/status";
import { requireUser } from "@/lib/auth/session";
import { hasProviderKeys } from "@/lib/provider-keys";
import { AssessmentPoller } from "./assessment-poller";
import { formatDate, formatDuration } from "@/lib/format";
import { recordingMode } from "@/lib/practice";
import { DeleteForm } from "./delete-form";

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

      <AssessmentPanel recordingId={recording.id} userId={user.id} assessment={assessment} />

      <DeleteForm recordingId={recording.id} />
    </div>
  );
}

async function AssessmentPanel({
  recordingId,
  userId,
  assessment,
}: {
  recordingId: string;
  userId: string;
  assessment: AssessmentState;
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
    const [transcript] = await db
      .select({ text: transcripts.text })
      .from(transcripts)
      .where(eq(transcripts.recordingId, recordingId));
    return (
      <section className="card stack">
        <h2>Transcript</h2>
        <p>{transcript?.text ?? "No transcript was stored."}</p>
      </section>
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
