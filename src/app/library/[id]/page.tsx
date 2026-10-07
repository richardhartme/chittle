import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { deleteRecording } from "@/app/actions";
import { db } from "@/db";
import { recordingRatings, recordings, topics } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDuration } from "@/lib/format";
import { RatingForm } from "./rating-form";

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
    .select({ recording: recordings, topic: topics.text, rating: recordingRatings })
    .from(recordings)
    .innerJoin(topics, eq(topics.id, recordings.topicId))
    .leftJoin(recordingRatings, eq(recordingRatings.recordingId, recordings.id))
    .where(and(eq(recordings.id, id), eq(recordings.userId, user.id)));
  if (!row) notFound();

  const { recording, topic, rating } = row;

  return (
    <div className="stack">
      <p>
        <Link href="/library">← Library</Link>
      </p>
      <h1>{topic}</h1>
      <p className="muted">
        {formatDate(recording.createdAt)} · {formatDuration(recording.durationSeconds)}
      </p>

      <video controls preload="metadata" src={`/api/recordings/${recording.id}/file`} />

      <div className="card stack">
        <h2>How did it go?</h2>
        <RatingForm recordingId={recording.id} initial={rating} />
      </div>

      <form action={deleteRecording}>
        <input type="hidden" name="recordingId" value={recording.id} />
        <button className="danger">Delete recording</button>
      </form>
    </div>
  );
}
