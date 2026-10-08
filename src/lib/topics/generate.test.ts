import { beforeEach, describe, expect, it, vi } from "vitest";
import { topics } from "@/db/schema";
import { createCategory, createTopic, db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(function (this: { messages: { create: typeof create } }) {
    this.messages = { create };
  }),
}));

import Anthropic from "@anthropic-ai/sdk";
import { canGenerateTopics, generateTopics } from "./generate";

const reply = (text: string) => ({ content: [{ type: "text", text }] });

beforeEach(async () => {
  await resetDb();
  create.mockReset();
  vi.mocked(Anthropic).mockClear();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("TOPIC_MODEL", "test-model");
});

describe("canGenerateTopics", () => {
  it("is true only when an API key is configured", () => {
    expect(canGenerateTopics()).toBe(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(canGenerateTopics()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("generateTopics", () => {
  it("does nothing without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const category = await createCategory("a");

    expect(await generateTopics(category)).toBe(0);
    expect(Anthropic).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("stores the generated topics as 'generated' in the category", async () => {
    const category = await createCategory("a", "Category A");
    create.mockResolvedValue(reply('["Describe your best day.", "Why do people travel?"]'));

    expect(await generateTopics(category)).toBe(2);

    const rows = await db.select().from(topics);
    expect(rows.map((r) => r.text).sort()).toEqual(["Describe your best day.", "Why do people travel?"]);
    expect(rows.every((r) => r.source === "generated" && r.categoryId === category.id)).toBe(true);
  });

  it("calls the configured model with the category name", async () => {
    const category = await createCategory("a", "Category A");
    create.mockResolvedValue(reply('["Describe your best day."]'));

    await generateTopics(category);

    expect(Anthropic).toHaveBeenCalledWith({ apiKey: "sk-test" });
    const request = create.mock.calls[0][0];
    expect(request.model).toBe("test-model");
    expect(request.messages[0].content).toContain("Category: Category A");
  });

  it("shows the model the existing topics so it can avoid repeats", async () => {
    const category = await createCategory("a");
    await createTopic(category.id, "Already here");
    create.mockResolvedValue(reply('["Something new entirely."]'));

    await generateTopics(category);

    expect(create.mock.calls[0][0].messages[0].content).toContain("- Already here");
  });

  it("only shows existing topics from the same category", async () => {
    const category = await createCategory("a");
    const other = await createCategory("b");
    await createTopic(other.id, "Other category topic");
    create.mockResolvedValue(reply('["Something new entirely."]'));

    await generateTopics(category);

    const prompt = create.mock.calls[0][0].messages[0].content;
    expect(prompt).not.toContain("Other category topic");
    expect(prompt).not.toContain("Do not repeat");
  });

  it("skips duplicates of existing topics and counts only new rows", async () => {
    const category = await createCategory("a");
    await createTopic(category.id, "Duplicate topic text");
    create.mockResolvedValue(reply('["Duplicate topic text", "A genuinely new topic"]'));

    expect(await generateTopics(category)).toBe(1);
    expect(await db.select().from(topics)).toHaveLength(2);
  });

  it("joins multiple text blocks and ignores non-text blocks", async () => {
    const category = await createCategory("a");
    create.mockResolvedValue({
      content: [
        { type: "text", text: '["First topic here", ' },
        { type: "thinking", thinking: "hmm" },
        { type: "text", text: '"Second topic here"]' },
      ],
    });

    expect(await generateTopics(category)).toBe(2);
  });

  it("rejects an unparseable reply and stores nothing", async () => {
    const category = await createCategory("a");
    create.mockResolvedValue(reply("I can't help with that."));

    await expect(generateTopics(category)).rejects.toThrow();
    expect(await db.select().from(topics)).toHaveLength(0);
  });

  it("propagates API errors", async () => {
    const category = await createCategory("a");
    create.mockRejectedValue(new Error("overloaded"));

    await expect(generateTopics(category)).rejects.toThrow("overloaded");
  });
});
