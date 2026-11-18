import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assessments, recordings, transcripts } from "@/db/schema";
import { transcribe } from "./deepgram";
import { AssessmentError } from "./errors";
import { measure } from "./measure";
import type { AssessmentResult } from "./result";

/** Bump when the scoring rules or prompts change. Version 1 has the measured dimensions only. */
export const SCORING_VERSION = 1;

export type AssessmentKeys = { deepgram: string; anthropic: string };

const UNEXPECTED = "Something went wrong while assessing this recording, try again.";

/**
 * Runs the assessment pipeline for a recording whose assessment was claimed at `claimedAt`. Never
 * throws: any failure is stored on the assessment as a message that's safe to show the speaker.
 */
export async function runAssessment(recordingId: string, claimedAt: Date, keys: AssessmentKeys): Promise<void> {
  try {
    const [recording] = await db.select().from(recordings).where(eq(recordings.id, recordingId));
    if (!recording) return; // Deleted since the assessment started.

    let [transcript] = await db
      .select({ words: transcripts.words, audioSeconds: transcripts.audioSeconds })
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

    // Judging the other three dimensions, and so the total score, comes in a later slice.
    const measured = measure(transcript.words, transcript.audioSeconds);
    await finish(recordingId, claimedAt, {
      status: "done",
      error: null,
      scoringVersion: SCORING_VERSION,
      paceScore: measured.scores.pace,
      fillerRateScore: measured.scores.fillerRate,
      pronunciationScore: measured.scores.pronunciation,
      result: { measured } satisfies AssessmentResult,
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
