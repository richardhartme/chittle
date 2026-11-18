import { sql } from "drizzle-orm";
import { db } from "@/db";
import { assessments } from "@/db/schema";

/** How long an assessment may stay pending before it's treated as failed and can be claimed again. */
export const STALE_AFTER_MINUTES = 5;

/**
 * Marks a recording's assessment as pending from now, unless one is already running. One atomic
 * upsert, so two simultaneous claims can't both succeed. Returns whether this call claimed it.
 */
export async function claimAssessment(recordingId: string): Promise<boolean> {
  const claimed = await db
    .insert(assessments)
    .values({ recordingId, status: "pending", startedAt: sql`now()` })
    .onConflictDoUpdate({
      target: assessments.recordingId,
      set: { status: "pending", startedAt: sql`now()`, completedAt: null, error: null },
      setWhere: sql`${assessments.status} <> 'pending'
        or ${assessments.startedAt} < now() - make_interval(mins => ${STALE_AFTER_MINUTES})`,
    })
    .returning({ recordingId: assessments.recordingId });
  return claimed.length > 0;
}
