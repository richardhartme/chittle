import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { AssessmentResult } from "@/lib/assessment/result";
import { FRAMEWORK_IDS } from "@/lib/frameworks";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
});

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const framework = pgEnum("framework", FRAMEWORK_IDS);

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // The answer structure its recordings are judged against (see src/lib/frameworks.ts).
  framework: framework("framework").notNull(),
});

export const topicSource = pgEnum("topic_source", ["predefined", "generated"]);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    source: topicSource("source").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("topics_category_text_unique").on(t.categoryId, t.text)],
);

export const userSeenTopics = pgTable(
  "user_seen_topics",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.topicId] })],
);

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("recordings_user_created_idx").on(t.userId, t.createdAt)],
);

export const provider = pgEnum("provider", ["deepgram", "anthropic"]);

export const providerKeys = pgTable(
  "provider_keys",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: provider("provider").notNull(),
    // AES-256-GCM ciphertext (see src/lib/crypto.ts), never the plain key.
    encryptedKey: text("encrypted_key").notNull(),
    keyHint: text("key_hint").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** One word as Deepgram heard it, with its timing in seconds and how sure it was (0 to 1). */
export type TranscriptWord = {
  word: string;
  punctuated_word: string;
  start: number;
  end: number;
  confidence: number;
};

export const transcripts = pgTable("transcripts", {
  recordingId: uuid("recording_id")
    .primaryKey()
    .references(() => recordings.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  words: jsonb("words").$type<TranscriptWord[]>().notNull(),
  audioSeconds: doublePrecision("audio_seconds").notNull(),
  createdAt: createdAt(),
});

export const assessmentStatus = pgEnum("assessment_status", ["pending", "done", "failed"]);

export const assessments = pgTable("assessments", {
  recordingId: uuid("recording_id")
    .primaryKey()
    .references(() => recordings.id, { onDelete: "cascade" }),
  status: assessmentStatus("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  // A short message that's safe to show the speaker. Never contains a provider key.
  error: text("error"),
  // Null until the assessment is done. Scoring version 1 (measured dimensions only) left the judged
  // scores and the total null.
  scoringVersion: integer("scoring_version"),
  totalScore: integer("total_score"),
  structureScore: integer("structure_score"),
  concisenessScore: integer("conciseness_score"),
  confidenceScore: integer("confidence_score"),
  pronunciationScore: integer("pronunciation_score"),
  fillerRateScore: integer("filler_rate_score"),
  paceScore: integer("pace_score"),
  result: jsonb("result").$type<AssessmentResult>(),
});

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type Provider = (typeof provider.enumValues)[number];
export type Transcript = typeof transcripts.$inferSelect;
export type Assessment = typeof assessments.$inferSelect;
export type AssessmentStatus = (typeof assessmentStatus.enumValues)[number];
