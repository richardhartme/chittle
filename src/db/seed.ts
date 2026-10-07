import { config } from "dotenv";
config({ path: ".env" });

import { sql } from "drizzle-orm";
import { seedCategories } from "./seed-data";

async function main() {
  // Imported after dotenv so DATABASE_URL is set when the client is created.
  const { db } = await import("./index");
  const { categories, topics } = await import("./schema");

  for (const { slug, name, topics: texts } of seedCategories) {
    const [category] = await db
      .insert(categories)
      .values({ slug, name })
      .onConflictDoUpdate({ target: categories.slug, set: { name } })
      .returning();

    await db
      .insert(topics)
      .values(texts.map((text) => ({ categoryId: category.id, text, source: "predefined" as const })))
      .onConflictDoNothing();
  }

  const [{ count }] = await db.execute<{ count: string }>(sql`select count(*) from topics`);
  console.log(`Seeded. ${seedCategories.length} categories, ${count} topics total.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
