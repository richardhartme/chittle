import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, recordings } from "@/db/schema";
import { DIMENSION_KEYS, DIMENSIONS, MAX_TOTAL, type DimensionKey } from "@/lib/assessment/dimensions";
import { dimensionScoreColumns, scoredAssessmentOf } from "@/lib/assessment/status";

/** How many of the most recent assessed recordings the dashboard covers: the last 7, the last 30, or all. */
export const RANGES = ["7", "30", "all"] as const;
export type Range = (typeof RANGES)[number];

/** What the dashboard shows: every dimension stacked, or one on its own, over a range of practices. */
export type DashboardFilters = { dimension: DimensionKey | "all"; range: Range };

export const DEFAULT_FILTERS: DashboardFilters = { dimension: "all", range: "7" };

type Query = Record<string, string | string[] | undefined>;

const oneOf = <T extends string>(options: readonly T[], value: string | string[] | undefined): T | undefined =>
  options.find((option) => option === value);

/** The filters from `?dimension=&range=`. Anything missing or unknown falls back to the default. */
export function parseDashboardFilters(query: Query): DashboardFilters {
  return {
    dimension: oneOf(["all", ...DIMENSION_KEYS], query.dimension) ?? DEFAULT_FILTERS.dimension,
    range: oneOf(RANGES, query.range) ?? DEFAULT_FILTERS.range,
  };
}

/** The dashboard's URL for some filters, leaving the defaults out so the plain home page is `/`. */
export function dashboardHref(filters: DashboardFilters): string {
  const query = new URLSearchParams();
  if (filters.dimension !== DEFAULT_FILTERS.dimension) query.set("dimension", filters.dimension);
  if (filters.range !== DEFAULT_FILTERS.range) query.set("range", filters.range);
  const search = query.toString();
  return search ? `/?${search}` : "/";
}

/** One assessed recording on the dashboard's chart. */
export type ScoreColumn = { recordingId: string; createdAt: Date; total: number; scores: Record<DimensionKey, number> };

/** How the dashboard shows the selected dimension: every dimension stacked against the total, or one on its own. */
export type DimensionView = {
  /** The dimensions drawn, in the fixed colour order. */
  keys: DimensionKey[];
  /** What a column is out of: 1000, or the dimension's maximum. */
  max: number;
  /** What a column measures: "Score", or the dimension's name. */
  name: string;
  /** A column's score in this view: its total, or the dimension's score. */
  value: (column: Pick<ScoreColumn, "total" | "scores">) => number;
};

export function dimensionView(dimension: DashboardFilters["dimension"]): DimensionView {
  if (dimension === "all") return { keys: DIMENSION_KEYS, max: MAX_TOTAL, name: "Score", value: (column) => column.total };
  const { name, max } = DIMENSIONS[dimension];
  return { keys: [dimension], max, name, value: (column) => column.scores[dimension] };
}

export type ScoreHistory = {
  /** The assessed recordings in range, oldest first. */
  columns: ScoreColumn[];
  /** The mean total out of 1000, or the selected dimension's mean out of its maximum. Null with nothing in range. */
  average: { score: number; max: number } | null;
};

/**
 * The speaker's most recent assessed recordings, as many as the range allows, with the average score.
 * Recordings that aren't assessed, failed, or were assessed before judging (no total) are left out.
 */
export async function scoreHistory(userId: string, filters: DashboardFilters): Promise<ScoreHistory> {
  const query = db
    .select({ recordingId: recordings.id, createdAt: recordings.createdAt, total: assessments.totalScore, scores: dimensionScoreColumns })
    .from(recordings)
    .innerJoin(assessments, eq(assessments.recordingId, recordings.id))
    .where(scoredAssessmentOf(userId))
    .orderBy(desc(recordings.createdAt), desc(recordings.id));
  const rows = filters.range === "all" ? await query : await query.limit(Number(filters.range));

  const columns = rows.reverse().map((row) => ({
    recordingId: row.recordingId,
    createdAt: row.createdAt,
    total: row.total ?? 0,
    scores: Object.fromEntries(DIMENSION_KEYS.map((key) => [key, row.scores[key] ?? 0])) as Record<DimensionKey, number>,
  }));
  if (columns.length === 0) return { columns, average: null };

  const view = dimensionView(filters.dimension);
  const values = columns.map(view.value);
  return {
    columns,
    average: { score: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), max: view.max },
  };
}
