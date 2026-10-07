import Anthropic from "@anthropic-ai/sdk";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { topics, type Category } from "@/db/schema";
import { env } from "@/lib/env";
import { parseTopicList } from "./parse";

const BATCH_SIZE = 10;
// How many existing topics to show the model so it avoids repeating them.
const EXISTING_CONTEXT_LIMIT = 200;

export function canGenerateTopics(): boolean {
  return Boolean(env.anthropicApiKey);
}

/**
 * Asks Claude for a fresh batch of speaking topics for a category and stores
 * them. Returns how many new topics were actually inserted.
 */
export async function generateTopics(category: Category): Promise<number> {
  if (!env.anthropicApiKey) return 0;

  const existing = await db
    .select({ text: topics.text })
    .from(topics)
    .where(eq(topics.categoryId, category.id))
    .orderBy(desc(topics.createdAt))
    .limit(EXISTING_CONTEXT_LIMIT);

  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const message = await client.messages.create({
    model: env.topicModel,
    max_tokens: 1500,
    system:
      "You write prompts for people practising impromptu speaking. Each prompt is a single topic or question " +
      "someone could speak about for one to three minutes. Reply with only a JSON array of strings.",
    messages: [
      {
        role: "user",
        content:
          `Category: ${category.name}\n` +
          `Write ${BATCH_SIZE} new, varied speaking prompts for this category.\n` +
          (existing.length
            ? `Do not repeat or closely paraphrase any of these existing prompts:\n${existing.map((t) => `- ${t.text}`).join("\n")}`
            : ""),
      },
    ],
  });

  const raw = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  const generated = parseTopicList(raw);

  const inserted = await db
    .insert(topics)
    .values(generated.map((text) => ({ categoryId: category.id, text, source: "generated" as const })))
    .onConflictDoNothing()
    .returning({ id: topics.id });
  return inserted.length;
}
