import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { assessments, categories, recordings, topics, transcripts } from "@/db/schema";
import { recentFocusVotes } from "@/lib/focus-votes";
import { redactForLogs } from "@/lib/logging";
import { refreshProgressInsight } from "@/lib/progress-insight";

import { transcribe } from "./deepgram";
import { AssessmentError } from "./errors";
import { judge } from "./judge";
import { measure } from "./measure";
import type { AssessmentResult } from "./result";
import { scoreJudgement } from "./score";
import { SCORING_VERSION } from "./version";

export type AssessmentKeys = { deepgram: string; anthropic: string };

const UNEXPECTED = "Something went wrong while assessing this recording. Try again.";

/**
 * Runs the assessment pipeline for a recording whose assessment was claimed at `claimedAt`, then
 * refreshes the speaker's progress insight. Never throws: any failure is stored on the assessment as a
 * message that's safe to show the speaker. The insight's own failures leave the assessment done.
 */
export async function runAssessment(recordingId: string, claimedAt: Date, keys: AssessmentKeys): Promise<void> {
  // Set once a done assessment is stored, unless a newer claim took over (its run refreshes instead).
  let assessedFor: string | null = null;
  try {
    const [row] = await db
      .select({ recording: recordings, topic: topics.text, category: categories.name, framework: categories.framework })
      .from(recordings)
      .innerJoin(topics, eq(topics.id, recordings.topicId))
      .innerJoin(categories, eq(categories.id, topics.categoryId))
      .where(eq(recordings.id, recordingId));
    if (!row) return; // Deleted since the assessment started.
    const { recording } = row;

    let [transcript] = await db
      .select({ text: transcripts.text, words: transcripts.words, audioSeconds: transcripts.audioSeconds })
      .from(transcripts)
      .where(eq(transcripts.recordingId, recordingId));
    if (!transcript) {
      const fresh = await transcribe(recording, keys.deepgram);
      await db
        .insert(transcripts)
        .values({ recordingId, ...fresh })
        .onConflictDoNothing();
      transcript = fresh;
    }

    const { words, audioSeconds: durationSeconds } = transcript;
    const measured = measure(words, durationSeconds);
    const judgement = await judge(
      {
        topic: row.topic,
        category: row.category,
        framework: row.framework,
        transcript: transcript.text,
        durationSeconds,
        measured,
        focusVotes: await recentFocusVotes(recording.userId),
      },
      keys.anthropic,
    );
    const { scores, total, judged } = scoreJudgement({ judgement, measured, words, durationSeconds });
    const stored = await finish(recordingId, claimedAt, {
      status: "done",
      error: null,
      scoringVersion: SCORING_VERSION,
      totalScore: total,
      structureScore: scores.structure,
      concisenessScore: scores.conciseness,
      confidenceScore: scores.confidence,
      pronunciationScore: scores.pronunciation,
      fillerRateScore: scores.fillerRate,
      paceScore: scores.pace,
      result: { measured, judged } satisfies AssessmentResult,
    });
    if (stored) assessedFor = recording.userId;
  } catch (err) {
    if (!(err instanceof AssessmentError)) {
      console.error(`Assessment of recording ${recordingId} failed:`, redactForLogs(err, Object.values(keys)));
    }
    await finish(recordingId, claimedAt, {
      status: "failed",
      error: err instanceof AssessmentError ? err.message : UNEXPECTED,
    }).catch((finishErr) =>
      console.error("Couldn't record the failed assessment:", redactForLogs(finishErr, Object.values(keys))),
    );
  }
  // Outside the try, so that nothing here can mark the stored assessment failed.
  if (assessedFor) await refreshProgressInsight(assessedFor, keys.anthropic);
}

/**
 * Records the outcome, unless a Retry or Re-assess has since claimed the assessment again (its start
 * time has moved on). True when it was recorded.
 */
async function finish(
  recordingId: string,
  claimedAt: Date,
  outcome: { status: "done" | "failed"; error: string | null } & Partial<typeof assessments.$inferInsert>,
): Promise<boolean> {
  const updated = await db
    .update(assessments)
    .set({ ...outcome, completedAt: sql`now()` })
    .where(and(eq(assessments.recordingId, recordingId), eq(assessments.startedAt, claimedAt)))
    .returning({ recordingId: assessments.recordingId });
  return updated.length > 0;
}
