import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/db";
import { assessments, recordings, topics } from "@/db/schema";
import { MAX_TOTAL } from "@/lib/assessment/dimensions";
import { assessmentStateColumns, toAssessmentState, type AssessmentState } from "@/lib/assessment/status";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatDuration } from "@/lib/format";
import { recordingMode } from "@/lib/practice";

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
      mimeType: recordings.mimeType,
      topic: topics.text,
      assessment: assessmentStateColumns,
      totalScore: assessments.totalScore,
    })
    .from(recordings)
    .innerJoin(topics, eq(topics.id, recordings.topicId))
    .leftJoin(assessments, eq(assessments.recordingId, recordings.id))
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
                  <span className="tag">{recordingMode(row.mimeType) === "audio" ? "Audio" : "Video"}</span>
                  {formatDate(row.createdAt)} · {formatDuration(row.durationSeconds)}
                  {assessmentLabel(toAssessmentState(row.assessment).status, row.totalScore)}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function assessmentLabel(status: AssessmentState["status"], totalScore: number | null) {
  if (status === "pending") return " · Analysing…";
  if (status === "none") return " · Not assessed";
  // Assessments from before judging was added are done without a total.
  if (status === "done" && totalScore !== null) return ` · ${totalScore}/${MAX_TOTAL}`;
  return null;
}
