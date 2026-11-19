import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { assessments, progressInsights, recordings } from "@/db/schema";
import { scoredAssessmentOf } from "@/lib/assessment/status";
import { redactForLogs } from "@/lib/logging";
import { progressInsightContext } from "./context";
import { generateProgressInsight } from "./generate";

/** How many scored assessments a speaker needs before there's any progress to see. */
export const MIN_ASSESSMENTS = 2;

/**
 * Regenerates the speaker's progress insight from their recent assessments, with their Anthropic key.
 * Run after an assessment is stored. Never throws: a failure is logged and the previous insight stays.
 */
export async function refreshProgressInsight(userId: string, anthropicKey: string): Promise<void> {
  try {
    const context = await progressInsightContext(userId);
    if (context.assessments.length < MIN_ASSESSMENTS) return;
    const text = await generateProgressInsight(context, anthropicKey);
    await db
      .insert(progressInsights)
      .values({ userId, text, generatedAt: sql`now()` })
      .onConflictDoUpdate({ target: progressInsights.userId, set: { text, generatedAt: sql`now()` } });
  } catch (err) {
    console.error(`Progress insight for user ${userId} failed:`, redactForLogs(err, [anthropicKey]));
  }
}

export type ProgressInsightState = {
  /** How many scored assessments the speaker has. */
  assessed: number;
  insight: { text: string; generatedAt: Date } | null;
};

/** The speaker's stored progress insight, and whether they've practised enough to have one. */
export async function progressInsightState(userId: string): Promise<ProgressInsightState> {
  const [[{ assessed }], [insight]] = await Promise.all([
    db
      .select({ assessed: count() })
      .from(recordings)
      .innerJoin(assessments, eq(assessments.recordingId, recordings.id))
      .where(scoredAssessmentOf(userId)),
    db
      .select({ text: progressInsights.text, generatedAt: progressInsights.generatedAt })
      .from(progressInsights)
      .where(eq(progressInsights.userId, userId)),
  ]);
  return { assessed, insight: insight ?? null };
}
