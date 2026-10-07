import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { recordings, topics } from "@/db/schema";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDuration } from "@/lib/format";

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <Library />
    </Suspense>
  );
}

async function Library() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: recordings.id,
      createdAt: recordings.createdAt,
      durationSeconds: recordings.durationSeconds,
      topic: topics.text,
    })
    .from(recordings)
    .innerJoin(topics, eq(topics.id, recordings.topicId))
    .where(eq(recordings.userId, user.id))
    .orderBy(desc(recordings.createdAt));

  return (
    <>
      <h1>Your recordings</h1>
      {rows.length === 0 ? (
        <p className="muted">
          Nothing here yet. <Link href="/practice">Record your first one.</Link>
        </p>
      ) : (
        <ul className="recording-list">
          {rows.map((row) => (
            <li key={row.id} className="card">
              <Link href={`/library/${row.id}`}>
                <strong>{row.topic}</strong>
                <div className="muted">
                  {formatDate(row.createdAt)} · {formatDuration(row.durationSeconds)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
