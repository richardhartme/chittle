import { and, desc, eq, isNotNull, lt } from "drizzle-orm";

import { db } from "@/db";
import { assessments, recordings } from "@/db/schema";

import type { DimensionKey } from "./dimensions";
import { dimensionScoreColumns } from "./status";

/** The scores of the attempt a retake is compared with. */
export type PreviousAttempt = { recordingId: string; total: number; scores: Record<DimensionKey, number | null> };

/**
 * The speaker's most recent earlier recording of the same topic that has a score, for comparing a
 * retake with. Recordings that aren't assessed, or were assessed before judging (no total), are skipped.
 */
export async function previousAttempt(recording: {
  userId: string;
  topicId: string;
  createdAt: Date;
}): Promise<PreviousAttempt | null> {
  const [row] = await db
    .select({
      recordingId: recordings.id,
      total: assessments.totalScore,
      scores: dimensionScoreColumns,
    })
    .from(recordings)
    .innerJoin(assessments, eq(assessments.recordingId, recordings.id))
    .where(
      and(
        eq(recordings.userId, recording.userId),
        eq(recordings.topicId, recording.topicId),
        lt(recordings.createdAt, recording.createdAt),
        eq(assessments.status, "done"),
        isNotNull(assessments.totalScore),
      ),
    )
    .orderBy(desc(recordings.createdAt))
    .limit(1);
  if (!row || row.total === null) return null;
  return { ...row, total: row.total };
}
