import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { db } from "@/db";
import { recordings, topics } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
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
    .select({ recording: recordings, topic: topics.text })
    .from(recordings)
    .innerJoin(topics, eq(topics.id, recordings.topicId))
    .where(and(eq(recordings.id, id), eq(recordings.userId, user.id)));
  if (!row) notFound();

  const { recording, topic } = row;
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

      <DeleteForm recordingId={recording.id} />
    </div>
  );
}
