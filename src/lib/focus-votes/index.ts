import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { assessments, type FocusVote, focusVotes, recordings } from "@/db/schema";

/** A focus vote as later assessments are given it: the area to improve and which way it was voted. */
export type CastFocusVote = { area: string; vote: FocusVote };

export type SaveFocusVoteResult = { saved: true } | { error: string };

/**
 * Casts, changes or (with `null`) clears the speaker's focus vote on one of a recording's areas to
 * improve. The recording must be theirs, and the area one its current assessment lists.
 */
export async function saveFocusVote(
  userId: string,
  recordingId: string,
  area: string,
  vote: FocusVote | null,
): Promise<SaveFocusVoteResult> {
  const [row] = await db
    .select({ result: assessments.result })
    .from(recordings)
    .innerJoin(assessments, eq(assessments.recordingId, recordings.id))
    .where(and(eq(recordings.id, recordingId), eq(recordings.userId, userId), eq(assessments.status, "done")));
  if (!row?.result?.judged?.areasToImprove.includes(area)) return { error: "That area to improve isn't in this assessment." };

  if (vote === null) {
    await db.delete(focusVotes).where(and(eq(focusVotes.recordingId, recordingId), eq(focusVotes.area, area)));
  } else {
    await db
      .insert(focusVotes)
      .values({ userId, recordingId, area, vote })
      .onConflictDoUpdate({ target: [focusVotes.recordingId, focusVotes.area], set: { vote, createdAt: sql`now()` } });
  }
  return { saved: true };
}

/** The speaker's focus votes on a recording, by area to improve. */
export async function focusVotesOn(userId: string, recordingId: string): Promise<Record<string, FocusVote>> {
  const rows = await db
    .select({ area: focusVotes.area, vote: focusVotes.vote })
    .from(focusVotes)
    .where(and(eq(focusVotes.userId, userId), eq(focusVotes.recordingId, recordingId)));
  return Object.fromEntries(rows.map(({ area, vote }) => [area, vote]));
}

/** How many of the speaker's focus votes later assessments are given. */
export const RECENT_FOCUS_VOTES = 20;

/**
 * The speaker's most recent focus votes across all their recordings, newest first, including votes on
 * areas a re-assess has since dropped: they still say what the speaker cares about.
 */
export async function recentFocusVotes(userId: string): Promise<CastFocusVote[]> {
  return db
    .select({ area: focusVotes.area, vote: focusVotes.vote })
    .from(focusVotes)
    .where(eq(focusVotes.userId, userId))
    .orderBy(desc(focusVotes.createdAt), desc(focusVotes.id))
    .limit(RECENT_FOCUS_VOTES);
}
