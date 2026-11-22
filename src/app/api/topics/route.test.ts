import { beforeEach, describe, expect, it, vi } from "vitest";

import { topics } from "@/db/schema";
import { signIn } from "@/test/auth";
import { createCategory, createCustomTopic, createTopic, createUser, db, resetDb } from "@/test/db";
import { resetNextMocks } from "@/test/next";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);

import { GET, POST } from "./route";

const get = (query = "") => GET(new Request(`http://localhost/api/topics${query}`));
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
});

describe("GET /api/topics", () => {
  it("requires sign-in", async () => {
    const res = await get("?category=a");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorised" });
  });

  it("requires a category", async () => {
    await signIn();
    const res = await get();
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "A category is required" });
  });

  it("lists the category's topics alphabetically", async () => {
    await signIn();
    const category = await createCategory("a");
    const one = await createTopic(category.id, "Zebras");
    const two = await createTopic(category.id, "Aardvarks");

    const res = await get("?category=a");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      topics: [
        { id: two.id, text: "Aardvarks" },
        { id: one.id, text: "Zebras" },
      ],
      customTopics: [],
    });
  });

  it("lists the user's own custom topics separately, and nobody else's", async () => {
    const user = await signIn();
    const category = await createCategory("a");
    const mine = await createCustomTopic(user.id, category.id, "Mine");
    await createCustomTopic((await createUser()).id, category.id, "Theirs");

    const res = await get("?category=a");

    expect(await res.json()).toEqual({ topics: [], customTopics: [{ id: mine.id, text: "Mine" }] });
  });

  it("returns an empty list for an unknown category", async () => {
    await signIn();
    const res = await get("?category=nope");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ topics: [], customTopics: [] });
  });

  it("returns a friendly 500 when the lookup fails", async () => {
    await signIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nextTopic = await import("@/lib/topics/next-topic");
    vi.spyOn(nextTopic, "categoryTopics").mockRejectedValueOnce(new Error("db down"));

    const res = await get("?category=a");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load topics. Try again." });
    vi.restoreAllMocks();
  });
});

describe("POST /api/topics", () => {
  it("requires sign-in", async () => {
    expect((await post({ category: "a", text: "A topic" })).status).toBe(401);
  });

  it("saves a custom topic for the user, trimmed, and returns it", async () => {
    const user = await signIn();
    const category = await createCategory("a");

    const res = await post({ category: "a", text: "  Describe a time you changed your mind  " });

    expect(res.status).toBe(201);
    const { topic } = await res.json();
    expect(topic).toEqual({ id: expect.any(String), text: "Describe a time you changed your mind" });
    expect(await db.select().from(topics)).toEqual([
      expect.objectContaining({ id: topic.id, categoryId: category.id, source: "custom", userId: user.id }),
    ]);
  });

  it.each([
    ["malformed JSON", "{nope", "A category is required"],
    ["a missing category", { text: "A topic" }, "A category is required"],
    ["missing text", { category: "a" }, "Write a topic of at least 3 characters."],
    ["text that's only spaces", { category: "a", text: "     " }, "Write a topic of at least 3 characters."],
    ["text under 3 characters", { category: "a", text: " ab " }, "Write a topic of at least 3 characters."],
    ["text over 300 characters", { category: "a", text: "x".repeat(301) }, "Keep the topic to 300 characters or fewer."],
  ])("rejects %s", async (_name, body, error) => {
    await signIn();
    await createCategory("a");

    const res = await post(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(await db.select().from(topics)).toEqual([]);
  });

  it("accepts exactly 300 characters", async () => {
    await signIn();
    await createCategory("a");
    expect((await post({ category: "a", text: "x".repeat(300) })).status).toBe(201);
  });

  it("returns 404 for an unknown category", async () => {
    await signIn();
    const res = await post({ category: "nope", text: "A topic" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "That category doesn't exist." });
  });

  it("returns a friendly 500 when saving fails", async () => {
    await signIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nextTopic = await import("@/lib/topics/next-topic");
    vi.spyOn(nextTopic, "createCustomTopic").mockRejectedValueOnce(new Error("db down"));

    const res = await post({ category: "a", text: "A topic" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't save your topic. Try again." });
    vi.restoreAllMocks();
  });
});
