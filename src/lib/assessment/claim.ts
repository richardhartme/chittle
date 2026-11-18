import { sql } from "drizzle-orm";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { isStale } from "./status";

/**
 * Marks a recording's assessment as pending from now, unless one is already running. One atomic
 * upsert, so two simultaneous claims can't both succeed. Returns the claim's start time, which the run
 * uses to check that its claim hasn't been taken over, or null if an assessment is already running.
 */
export async function claimAssessment(recordingId: string): Promise<Date | null> {
  // Truncated to milliseconds so the value survives the round trip through a JavaScript Date.
  const now = sql`date_trunc('milliseconds', now())`;
  const [claimed] = await db
    .insert(assessments)
    .values({ recordingId, status: "pending", startedAt: now })
    .onConflictDoUpdate({
      target: assessments.recordingId,
      set: { status: "pending", startedAt: now, completedAt: null, error: null },
      setWhere: sql`${assessments.status} <> 'pending' or ${isStale}`,
    })
    .returning({ startedAt: assessments.startedAt });
  return claimed?.startedAt ?? null;
}
