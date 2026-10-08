import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "@/test/auth";
import { createCategory, createTopic, resetDb } from "@/test/db";
import { resetNextMocks } from "@/test/next";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);

import { GET } from "./route";

const get = (query = "") => GET(new Request(`http://localhost/api/topics${query}`));

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
    });
  });

  it("returns an empty list for an unknown category", async () => {
    await signIn();
    const res = await get("?category=nope");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ topics: [] });
  });

  it("returns a friendly 500 when the lookup fails", async () => {
    await signIn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nextTopic = await import("@/lib/topics/next-topic");
    vi.spyOn(nextTopic, "categoryTopics").mockRejectedValueOnce(new Error("db down"));

    const res = await get("?category=a");

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Couldn't load topics. Please try again." });
    vi.restoreAllMocks();
  });
});
