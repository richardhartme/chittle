import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userSeenTopics } from "@/db/schema";
import { signIn } from "@/test/auth";
import { createCategory, createTopic, db, resetDb } from "@/test/db";
import { resetNextMocks } from "@/test/next";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);

import { POST } from "./route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/topics/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/topics/next", () => {
  it("requires sign-in", async () => {
    const res = await post({ category: "a" });
    expect(res.status).toBe(401);
  });

  it.each([
    ["malformed JSON", "{nope"],
    ["a missing category", {}],
    ["an empty category", { category: "" }],
    ["a non-uuid topicId", { category: "a", topicId: "123" }],
  ])("rejects %s", async (_name, body) => {
    await signIn();
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A category is required" });
  });

  it("returns an unseen topic from the category", async () => {
    const user = await signIn();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "Only topic");

    const res = await post({ category: "a" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ topic: { id: topic.id, text: "Only topic" } });
    expect(await db.select().from(userSeenTopics)).toEqual([
      expect.objectContaining({ userId: user.id, topicId: topic.id }),
    ]);
  });

  it("returns 404 once the user has seen every topic", async () => {
    await signIn();
    const category = await createCategory("a");
    await createTopic(category.id, "Only topic");

    expect((await post({ category: "a" })).status).toBe(200);
    const res = await post({ category: "a" });

    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/seen every topic/);
  });

  it("returns 404 for an unknown category", async () => {
    await signIn();
    expect((await post({ category: "nope" })).status).toBe(404);
  });

  describe("with a topicId", () => {
    it("returns the chosen topic, even if already seen", async () => {
      const user = await signIn();
      const category = await createCategory("a");
      const topic = await createTopic(category.id, "Chosen");

      for (let i = 0; i < 2; i++) {
        const res = await post({ category: "a", topicId: topic.id });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ topic: { id: topic.id, text: "Chosen" } });
      }
      expect(await db.select().from(userSeenTopics)).toHaveLength(1);
      expect((await db.select().from(userSeenTopics))[0].userId).toBe(user.id);
    });

    it("returns 404 if the topic isn't in that category", async () => {
      await signIn();
      const a = await createCategory("a");
      await createCategory("b");
      const topic = await createTopic(a.id, "In a");

      const res = await post({ category: "b", topicId: topic.id });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "That topic doesn't exist." });
    });
  });

  it("returns a friendly 500 when something throws", async () => {
    await signIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nextTopic = await import("@/lib/topics/next-topic");
    vi.spyOn(nextTopic, "nextTopic").mockRejectedValueOnce(new Error("boom"));

    const res = await post({ category: "a" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't get a topic. Please try again." });
  });
});
