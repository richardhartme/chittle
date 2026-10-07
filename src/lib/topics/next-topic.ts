import { and, asc, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, topics, userSeenTopics, type Topic } from "@/db/schema";
import { canGenerateTopics, generateTopics } from "./generate";

async function pickUnseen(userId: string, categoryId: string): Promise<Topic | undefined> {
  const [topic] = await db
    .select()
    .from(topics)
    .where(
      and(
        eq(topics.categoryId, categoryId),
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

/** All topics in the category, for the user to choose from. */
export async function categoryTopics(categorySlug: string): Promise<Pick<Topic, "id" | "text">[]> {
  return db
    .select({ id: topics.id, text: topics.text })
    .from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(eq(categories.slug, categorySlug))
    .orderBy(asc(topics.text));
}

/** Returns a specific topic in the category and marks it as seen, so it isn't served again as new. */
export async function chooseTopic(userId: string, categorySlug: string, topicId: string): Promise<Topic | null> {
  const [row] = await db
    .select({ topic: topics })
    .from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(and(eq(topics.id, topicId), eq(categories.slug, categorySlug)));
  if (!row) return null;

  await db.insert(userSeenTopics).values({ userId, topicId }).onConflictDoNothing();
  return row.topic;
}
