import { and, asc, desc, eq, isNull, notExists, or, type SQL, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, topics, userSeenTopics, type Topic } from "@/db/schema";
import type { TopicSummary } from "@/lib/practice";

import { canGenerateTopics, generateTopics } from "./generate";

/** Shared topics, and the custom topics this user wrote. Other users' custom topics are never visible. */
export const visibleTo = (userId: string) => or(isNull(topics.userId), eq(topics.userId, userId));

async function pickUnseen(userId: string, categoryId: string): Promise<Topic | undefined> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.categoryId, categoryId),
        // Only shared topics are served at random.
        isNull(topics.userId),
        notExists(
          db
            .select({ one: sql`1` })
            .from(userSeenTopics)
            .where(and(eq(userSeenTopics.topicId, topics.id), eq(userSeenTopics.userId, userId))),
        ),
      ),
    )
    // Predefined topics first, then random within each group.
    .orderBy(sql`${topics.source} = 'predefined' desc`, sql`random()`)
    .limit(1);
  return topic;
}

/**
 * Returns a topic in the category that the user hasn't seen yet and marks it as
 * seen. Predefined topics are served first; once they run out, new topics are
 * generated. Returns null if the category is unknown or nothing new is available.
 */
export async function nextTopic(userId: string, categorySlug: string): Promise<Topic | null> {
  const [category] = await db.select().from(categories).where(eq(categories.slug, categorySlug));
  if (!category) return null;

  let topic = await pickUnseen(userId, category.id);
  if (!topic && canGenerateTopics()) {
    if ((await generateTopics(category)) > 0) topic = await pickUnseen(userId, category.id);
  }
  if (!topic) return null;

  await db.insert(userSeenTopics).values({ userId, topicId: topic.id }).onConflictDoNothing();
  return topic;
}

/**
 * The topics in the category the user can choose from: the shared ones sorted by text, and the user's
 * own custom topics, newest first.
 */
export async function categoryTopics(
  userId: string,
  categorySlug: string,
): Promise<{ topics: TopicSummary[]; customTopics: TopicSummary[] }> {
  const inCategory = (owner: SQL | undefined) =>
    db
      .select({ id: topics.id, text: topics.text })
      .from(topics)
      .innerJoin(categories, eq(categories.id, topics.categoryId))
      .where(and(eq(categories.slug, categorySlug), owner));

  const [shared, custom] = await Promise.all([
    inCategory(isNull(topics.userId)).orderBy(asc(topics.text)),
    inCategory(eq(topics.userId, userId)).orderBy(desc(topics.createdAt)),
  ]);
  return { topics: shared, customTopics: custom };
}

/** Returns a specific topic in the category and marks it as seen, so it isn't served again as new. */
export async function chooseTopic(userId: string, categorySlug: string, topicId: string): Promise<Topic | null> {
  const [row] = await db
    .select({ topic: topics })
    .from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(and(eq(topics.id, topicId), eq(categories.slug, categorySlug), visibleTo(userId)));
  if (!row) return null;

  await db.insert(userSeenTopics).values({ userId, topicId }).onConflictDoNothing();
  return row.topic;
}

/** Saves a custom topic the user wrote, in the category. Returns null if the category is unknown. */
export async function createCustomTopic(userId: string, categorySlug: string, text: string): Promise<Topic | null> {
  const [category] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, categorySlug));
  if (!category) return null;

  const [topic] = await db
    .insert(topics)
    .values({ categoryId: category.id, text, source: "custom", userId })
    .returning();
  return topic;
}

/** A topic the user can see, with its category's slug, or null if it's unknown or another user's. */
export async function findTopic(
  userId: string,
  topicId: string,
): Promise<(TopicSummary & { category: string }) | null> {
  const [row] = await db
    .select({ id: topics.id, text: topics.text, category: categories.slug })
    .from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(and(eq(topics.id, topicId), visibleTo(userId)));
  return row ?? null;
}
