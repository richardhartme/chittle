import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

/**
 * An in-process Postgres (PGlite) with the real migrations applied, so tests exercise the same SQL,
 * constraints and cascades as production without needing Docker. Each test file gets its own instance;
 * call `resetDb()` in `beforeEach` to start from empty tables.
 */
const client = new PGlite();
export const db = drizzle(client, { schema });

await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });

export async function resetDb(): Promise<void> {
  await client.exec("truncate table users, magic_links, categories restart identity cascade");
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}-${counter++}`;

export async function createUser(email = `user-${unique()}@example.com`) {
  const [user] = await db.insert(schema.users).values({ email }).returning();
  return user;
}

export async function createCategory(slug = `cat-${unique()}`, name = slug) {
  const [category] = await db.insert(schema.categories).values({ slug, name }).returning();
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
      prepSeconds: 30,
      ...overrides,
    })
    .returning();
  return recording;
}
