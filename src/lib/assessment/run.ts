import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assessments, categories, recordings, topics, transcripts } from "@/db/schema";
import { transcribe } from "./deepgram";
import { AssessmentError } from "./errors";
import { judge } from "./judge";
import { measure } from "./measure";
import type { AssessmentResult } from "./result";
import { scoreJudgement } from "./score";

/**
 * Bump when the scoring rules or prompts change. Version 1 had the measured dimensions only; version 2
 * adds Claude's judged dimensions, the feedback and the total; version 3 adds the coach insights,
 * including the ideal version.
 */
export const SCORING_VERSION = 3;

export type AssessmentKeys = { deepgram: string; anthropic: string };

const UNEXPECTED = "Something went wrong while assessing this recording, try again.";

/**
 * Runs the assessment pipeline for a recording whose assessment was claimed at `claimedAt`. Never
 * throws: any failure is stored on the assessment as a message that's safe to show the speaker.
 */
export async function runAssessment(recordingId: string, claimedAt: Date, keys: AssessmentKeys): Promise<void> {
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
      { topic: row.topic, category: row.category, framework: row.framework, transcript: transcript.text, durationSeconds, measured },
      keys.anthropic,
    );
    const { scores, total, judged } = scoreJudgement({ judgement, measured, words, durationSeconds });
    await finish(recordingId, claimedAt, {
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
  } catch (err) {
    if (!(err instanceof AssessmentError)) {
      console.error(`Assessment of recording ${recordingId} failed:`, redact(summarise(err), keys));
    }
    await finish(recordingId, claimedAt, {
      status: "failed",
      error: err instanceof AssessmentError ? err.message : UNEXPECTED,
    }).catch((finishErr) =>
      console.error("Couldn't record the failed assessment:", redact(summarise(finishErr), keys)),
    );
  }
}

/** Records the outcome, unless a Retry has since claimed the assessment again (its start time has moved on). */
async function finish(
  recordingId: string,
  claimedAt: Date,
  outcome: { status: "done" | "failed"; error: string | null } & Partial<typeof assessments.$inferInsert>,
) {
  await db
    .update(assessments)
    .set({ ...outcome, completedAt: sql`now()` })
    .where(and(eq(assessments.recordingId, recordingId), eq(assessments.startedAt, claimedAt)));
}

const summarise = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/** Strips the speaker's keys out of text bound for the logs. */
function redact(text: string, keys: AssessmentKeys): string {
  return Object.values(keys).reduce((out, key) => (key ? out.replaceAll(key, "[redacted]") : out), text);
}
