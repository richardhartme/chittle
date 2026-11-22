import { and, eq, isNotNull, sql } from "drizzle-orm";

import { assessments, type AssessmentStatus, recordings } from "@/db/schema";

/** How long an assessment may stay pending before it's treated as failed and can be claimed again. */
export const STALE_AFTER_MINUTES = 5;

/** An assessment as the speaker sees it. `none` means the recording hasn't been assessed. */
export type AssessmentState =
  { status: "none" | "pending" | "done"; error: null } | { status: "failed"; error: string };

export const STALE_ERROR = "The assessment stopped before it finished.";

/**
 * True when an assessment has been pending too long to still be running (probably cut off by a
 * restart). Checked against the database clock, the same one `claimAssessment` uses.
 */
export const isStale = sql<boolean>`(${assessments.status} = 'pending'
  and ${assessments.startedAt} < now() - make_interval(mins => ${STALE_AFTER_MINUTES}))`;

/**
 * Matches the speaker's scored assessments: done and with a total, so not failed, pending or measured
 * before judging. For a query joining `recordings` to `assessments`.
 */
export const scoredAssessmentOf = (userId: string) =>
  and(eq(recordings.userId, userId), eq(assessments.status, "done"), isNotNull(assessments.totalScore));

/** Columns to select (alongside a left join on `assessments`) to build an `AssessmentState`. */
export const assessmentStateColumns = {
  status: assessments.status,
  error: assessments.error,
  stale: isStale,
};

/** Each dimension's score column, to select as a nested `scores` object keyed like `DIMENSIONS`. */
export const dimensionScoreColumns = {
  structure: assessments.structureScore,
  conciseness: assessments.concisenessScore,
  confidence: assessments.confidenceScore,
  pronunciation: assessments.pronunciationScore,
  fillerRate: assessments.fillerRateScore,
  pace: assessments.paceScore,
};

/** Builds the state from those columns. A left join with no assessment gives nulls, or a null object when nested. */
export function toAssessmentState(
  row: { status: AssessmentStatus | null; error: string | null; stale: boolean | null } | null,
): AssessmentState {
  if (!row?.status) return { status: "none", error: null };
  if (row.stale) return { status: "failed", error: STALE_ERROR };
  if (row.status === "failed") return { status: "failed", error: row.error ?? "The assessment failed." };
  return { status: row.status, error: null };
}
