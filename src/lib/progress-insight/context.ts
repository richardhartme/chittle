import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { assessments, categories, recordings, topics } from "@/db/schema";
import type { DimensionKey } from "@/lib/assessment/dimensions";
import { dimensionScoreColumns } from "@/lib/assessment/status";
import { type CastFocusVote, recentFocusVotes } from "@/lib/focus-votes";
import type { FrameworkId } from "@/lib/frameworks";

/** How many of the speaker's most recent assessments the progress insight looks across. */
export const RECENT_ASSESSMENTS = 10;
/** How many of each assessment's areas to improve the progress insight is given. */
export const TOP_AREAS = 3;

/** One of the speaker's recent assessments, as the progress insight is given it. */
export type InsightAssessment = {
  /** When the recording was made. */
  date: Date;
  category: string;
  framework: FrameworkId;
  total: number;
  scores: Record<DimensionKey, number | null>;
  /** The assessment's first (most important) areas to improve. */
  areasToImprove: string[];
};

export type InsightContext = { assessments: InsightAssessment[]; focusVotes: CastFocusVote[] };

/**
 * What the progress insight is written from: the speaker's last 10 scored assessments, oldest first so
 * trends read in order, and their recent focus votes, newest first.
 */
export async function insightContext(userId: string): Promise<InsightContext> {
  const rows = await db
    .select({
      date: recordings.createdAt,
      category: categories.name,
      framework: categories.framework,
      total: assessments.totalScore,
      scores: dimensionScoreColumns,
      result: assessments.result,
    })
    .from(recordings)
    .innerJoin(assessments, eq(assessments.recordingId, recordings.id))
    .innerJoin(topics, eq(topics.id, recordings.topicId))
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(and(eq(recordings.userId, userId), eq(assessments.status, "done"), isNotNull(assessments.totalScore)))
    .orderBy(desc(recordings.createdAt), desc(recordings.id))
    .limit(RECENT_ASSESSMENTS);

  return {
    assessments: rows.reverse().map(({ result, total, ...row }) => ({
      ...row,
      total: total!,
      areasToImprove: result?.judged?.areasToImprove.slice(0, TOP_AREAS) ?? [],
    })),
    focusVotes: await recentFocusVotes(userId),
  };
}
