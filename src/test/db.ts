import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { DimensionKey } from "@/lib/assessment/dimensions";
import type { AssessmentResult } from "@/lib/assessment/result";
import { SCORING_VERSION } from "@/lib/assessment/version";
import type { FrameworkId } from "@/lib/frameworks";
import { judgementFixture } from "./judgement";

/**
 * An in-process Postgres (PGlite) with the real migrations applied, so tests exercise the same SQL,
 * constraints and cascades as production without needing Docker. Each test file gets its own instance;
 * call `resetDb()` in `beforeEach` to start from empty tables.
 */
const client = new PGlite();
export const db = drizzle(client, { schema });

// A path, not a URL: in component tests jsdom replaces the global URL, which fileURLToPath rejects.
await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });

export async function resetDb(): Promise<void> {
  await client.exec("truncate table users, magic_links, categories restart identity cascade");
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}-${counter++}`;

export async function createUser(email = `user-${unique()}@example.com`) {
  const [user] = await db.insert(schema.users).values({ email }).returning();
  return user;
}

export async function createCategory(slug = `cat-${unique()}`, name = slug, framework: FrameworkId = "prep") {
  const [category] = await db.insert(schema.categories).values({ slug, name, framework }).returning();
  return category;
}

export async function createTopic(
  categoryId: string,
  text = `Topic ${unique()}`,
  source: "predefined" | "generated" = "predefined",
) {
  const [topic] = await db.insert(schema.topics).values({ categoryId, text, source }).returning();
  return topic;
}

export async function createRecording(
  userId: string,
  topicId: string,
  overrides: Partial<typeof schema.recordings.$inferInsert> = {},
) {
  const [recording] = await db
    .insert(schema.recordings)
    .values({
      userId,
      topicId,
      storageKey: `${userId}/${unique()}.webm`,
      mimeType: "video/webm",
      sizeBytes: 1000,
      durationSeconds: 60,
      ...overrides,
    })
    .returning();
  return recording;
}

/** The dimension scores `createAssessedRecording` gives by default, totalling 650. */
export const ASSESSED_SCORES: Record<DimensionKey, number> = {
  structure: 200,
  conciseness: 120,
  confidence: 80,
  pronunciation: 100,
  fillerRate: 90,
  pace: 60,
};

/**
 * A recording with an assessment. By default it's done under the current scoring version, with
 * `ASSESSED_SCORES`, a total of their sum, and a judgement listing `areasToImprove`. A null
 * `totalScore` gives a done assessment from before judging (scoring version 1: the measured scores,
 * no total). A pending or failed one has no scores.
 */
export async function createAssessedRecording(
  userId: string,
  topicId: string,
  {
    createdAt,
    status = "done",
    scores = ASSESSED_SCORES,
    totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0),
    areasToImprove = ["Open with your point", "Cut the hedges"],
  }: {
    createdAt?: Date;
    status?: schema.AssessmentStatus;
    scores?: Record<DimensionKey, number>;
    totalScore?: number | null;
    areasToImprove?: string[];
  } = {},
) {
  const recording = await createRecording(userId, topicId, createdAt ? { createdAt } : {});
  const at = createdAt ?? new Date();
  const done = status === "done";
  const judged = done && totalScore !== null;
  await db.insert(schema.assessments).values({
    recordingId: recording.id,
    status,
    startedAt: at,
    ...(status === "failed" && { error: "The assessment failed." }),
    ...(done && {
      completedAt: at,
      scoringVersion: 1,
      pronunciationScore: scores.pronunciation,
      fillerRateScore: scores.fillerRate,
      paceScore: scores.pace,
    }),
    ...(judged && {
      scoringVersion: SCORING_VERSION,
      totalScore,
      structureScore: scores.structure,
      concisenessScore: scores.conciseness,
      confidenceScore: scores.confidence,
      result: { judged: { ...judgementFixture(), areasToImprove } } as unknown as AssessmentResult,
    }),
  });
  return recording;
}
