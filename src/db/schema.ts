import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
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
    prepSeconds: integer("prep_seconds").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("recordings_user_created_idx").on(t.userId, t.createdAt)],
);

const rating = (name: string) => smallint(name).notNull();

export const recordingRatings = pgTable(
  "recording_ratings",
  {
    recordingId: uuid("recording_id")
      .primaryKey()
      .references(() => recordings.id, { onDelete: "cascade" }),
    clarity: rating("clarity"),
    confidence: rating("confidence"),
    structure: rating("structure"),
    pacing: rating("pacing"),
    bodyLanguage: rating("body_language"),
    note: text("note").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "recording_ratings_range",
      sql`${t.clarity} between 1 and 5 and ${t.confidence} between 1 and 5 and ${t.structure} between 1 and 5 and ${t.pacing} between 1 and 5 and ${t.bodyLanguage} between 1 and 5`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Recording = typeof recordings.$inferSelect;
export type RecordingRating = typeof recordingRatings.$inferSelect;
