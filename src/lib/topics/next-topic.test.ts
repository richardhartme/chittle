import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { topics, userSeenTopics } from "@/db/schema";
import { createCategory, createCustomTopic, createTopic, createUser, db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("./generate", () => ({ canGenerateTopics: vi.fn(() => false), generateTopics: vi.fn() }));

import { canGenerateTopics, generateTopics } from "./generate";
import { categoryTopics, chooseTopic, createCustomTopic as writeTopic, findTopic, nextTopic } from "./next-topic";

beforeEach(async () => {
  await resetDb();
  vi.mocked(canGenerateTopics).mockReset().mockReturnValue(false);
  vi.mocked(generateTopics).mockReset();
});

const seenBy = async () => (await db.select().from(userSeenTopics)).map((s) => s.topicId);

describe("nextTopic", () => {
  it("returns null for an unknown category", async () => {
    const user = await createUser();
    expect(await nextTopic(user.id, "nope")).toBeNull();
  });

  it("returns null for a category with no topics", async () => {
    const user = await createUser();
    const category = await createCategory("empty");
    expect(await nextTopic(user.id, category.slug)).toBeNull();
  });

  it("returns a topic from the requested category and marks it as seen", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const other = await createCategory("b");
    const topic = await createTopic(category.id, "In category");
    await createTopic(other.id, "Elsewhere");

    const result = await nextTopic(user.id, "a");

    expect(result?.id).toBe(topic.id);
    expect(await seenBy()).toEqual([topic.id]);
  });

  it("never repeats a topic for the same user, then runs out", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const created = await Promise.all(["one", "two", "three"].map((t) => createTopic(category.id, t)));

    const served = [];
    for (let i = 0; i < created.length; i++) served.push((await nextTopic(user.id, "a"))!.id);

    expect(new Set(served)).toEqual(new Set(created.map((t) => t.id)));
    expect(await nextTopic(user.id, "a")).toBeNull();
  });

  it("tracks seen topics per user", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "only one");

    expect((await nextTopic(alice.id, "a"))?.id).toBe(topic.id);
    expect(await nextTopic(alice.id, "a")).toBeNull();
    expect((await nextTopic(bob.id, "a"))?.id).toBe(topic.id);
  });

  it("serves predefined topics before generated ones", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const generated = await Promise.all(
      ["g1", "g2", "g3", "g4"].map((t) => createTopic(category.id, t, "generated")),
    );
    const predefined = await Promise.all(["p1", "p2"].map((t) => createTopic(category.id, t, "predefined")));

    const first = await nextTopic(user.id, "a");
    const second = await nextTopic(user.id, "a");
    const third = await nextTopic(user.id, "a");

    expect(new Set([first!.id, second!.id])).toEqual(new Set(predefined.map((t) => t.id)));
    expect(generated.map((t) => t.id)).toContain(third!.id);
  });

  it("never serves a custom topic, the user's own or anyone else's", async () => {
    const user = await createUser();
    const other = await createUser();
    const category = await createCategory("a");
    await createCustomTopic(user.id, category.id, "Mine");
    await createCustomTopic(other.id, category.id, "Theirs");

    expect(await nextTopic(user.id, "a")).toBeNull();
  });

  describe("when topics run out", () => {
    it("does not generate if generation is unavailable", async () => {
      const user = await createUser();
      await createCategory("a");

      expect(await nextTopic(user.id, "a")).toBeNull();
      expect(generateTopics).not.toHaveBeenCalled();
    });

    it("generates a new batch and serves from it", async () => {
      const user = await createUser();
      const category = await createCategory("a");
      vi.mocked(canGenerateTopics).mockReturnValue(true);
      vi.mocked(generateTopics).mockImplementation(async (c) => {
        await createTopic(c.id, "Fresh topic", "generated");
        return 1;
      });

      const result = await nextTopic(user.id, "a");

      expect(generateTopics).toHaveBeenCalledWith(expect.objectContaining({ id: category.id, slug: "a" }));
      expect(result?.text).toBe("Fresh topic");
      expect(await seenBy()).toEqual([result!.id]);
    });

    it("returns null if generation adds nothing new", async () => {
      const user = await createUser();
      await createCategory("a");
      vi.mocked(canGenerateTopics).mockReturnValue(true);
      vi.mocked(generateTopics).mockResolvedValue(0);

      expect(await nextTopic(user.id, "a")).toBeNull();
      expect(await seenBy()).toEqual([]);
    });

    it("does not generate while unseen topics remain", async () => {
      const user = await createUser();
      const category = await createCategory("a");
      await createTopic(category.id, "left");
      vi.mocked(canGenerateTopics).mockReturnValue(true);

      await nextTopic(user.id, "a");

      expect(generateTopics).not.toHaveBeenCalled();
    });

    it("propagates generation failures", async () => {
      const user = await createUser();
      await createCategory("a");
      vi.mocked(canGenerateTopics).mockReturnValue(true);
      vi.mocked(generateTopics).mockRejectedValue(new Error("API down"));

      await expect(nextTopic(user.id, "a")).rejects.toThrow("API down");
    });
  });
});

describe("categoryTopics", () => {
  it("lists only the category's shared topics, sorted by text", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const other = await createCategory("b");
    await createTopic(category.id, "Banana");
    await createTopic(category.id, "Apple");
    await createTopic(other.id, "Cherry");

    const result = await categoryTopics(user.id, "a");

    expect(result.topics.map((t) => t.text)).toEqual(["Apple", "Banana"]);
    expect(Object.keys(result.topics[0]).sort()).toEqual(["id", "text"]);
    expect(result.customTopics).toEqual([]);
  });

  it("lists the user's custom topics in the category separately, newest first", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const other = await createCategory("b");
    const older = await createCustomTopic(user.id, category.id, "Older");
    await db.update(topics).set({ createdAt: new Date("2026-01-01") }).where(eq(topics.id, older.id));
    const newer = await createCustomTopic(user.id, category.id, "Newer");
    await createCustomTopic(user.id, other.id, "Other category");
    await createTopic(category.id, "Shared");

    const result = await categoryTopics(user.id, "a");

    expect(result.customTopics).toEqual([
      { id: newer.id, text: "Newer" },
      { id: older.id, text: "Older" },
    ]);
    expect(result.topics.map((t) => t.text)).toEqual(["Shared"]);
  });

  it("leaves out other users' custom topics", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    await createCustomTopic((await createUser()).id, category.id, "Theirs");

    expect(await categoryTopics(user.id, "a")).toEqual({ topics: [], customTopics: [] });
  });

  it("returns empty lists for an unknown category", async () => {
    const user = await createUser();
    expect(await categoryTopics(user.id, "nope")).toEqual({ topics: [], customTopics: [] });
  });

  it("includes topics the user has already seen", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    await createTopic(category.id, "seen");
    await nextTopic(user.id, "a");

    expect((await categoryTopics(user.id, "a")).topics).toHaveLength(1);
  });
});

describe("chooseTopic", () => {
  it("returns the topic and marks it as seen", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "pick me");

    const result = await chooseTopic(user.id, "a", topic.id);

    expect(result?.id).toBe(topic.id);
    expect(await seenBy()).toEqual([topic.id]);
  });

  it("can be repeated without error", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "again");

    await chooseTopic(user.id, "a", topic.id);
    expect((await chooseTopic(user.id, "a", topic.id))?.id).toBe(topic.id);
    expect(await seenBy()).toEqual([topic.id]);
  });

  it("stops a chosen topic being served as new", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "chosen");

    await chooseTopic(user.id, "a", topic.id);

    expect(await nextTopic(user.id, "a")).toBeNull();
  });

  it("returns null when the topic is in a different category", async () => {
    const user = await createUser();
    const a = await createCategory("a");
    await createCategory("b");
    const topic = await createTopic(a.id, "in a");

    expect(await chooseTopic(user.id, "b", topic.id)).toBeNull();
    expect(await seenBy()).toEqual([]);
  });

  it("returns null for an unknown topic or category", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "x");

    expect(await chooseTopic(user.id, "a", "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await chooseTopic(user.id, "nope", topic.id)).toBeNull();
  });
});

describe("choosing a custom topic", () => {
  it("returns the user's own custom topic", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createCustomTopic(user.id, category.id, "Mine");

    expect((await chooseTopic(user.id, "a", topic.id))?.id).toBe(topic.id);
  });

  it("returns null for another user's custom topic", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createCustomTopic((await createUser()).id, category.id, "Theirs");

    expect(await chooseTopic(user.id, "a", topic.id)).toBeNull();
    expect(await seenBy()).toEqual([]);
  });
});

describe("createCustomTopic", () => {
  it("saves a custom topic owned by the user in the category", async () => {
    const user = await createUser();
    const category = await createCategory("a");

    const topic = await writeTopic(user.id, "a", "Describe a time you changed your mind");

    expect(topic).toEqual(
      expect.objectContaining({
        categoryId: category.id,
        text: "Describe a time you changed your mind",
        source: "custom",
        userId: user.id,
      }),
    );
  });

  it("makes a new topic each time, even when the text matches an existing one", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const shared = await createTopic(category.id, "Same words");

    const first = await writeTopic(user.id, "a", "Same words");
    const second = await writeTopic(user.id, "a", "Same words");

    expect(new Set([shared.id, first!.id, second!.id]).size).toBe(3);
  });

  it("returns null for an unknown category", async () => {
    const user = await createUser();
    expect(await writeTopic(user.id, "nope", "A topic")).toBeNull();
    expect(await db.select().from(topics)).toEqual([]);
  });
});

describe("findTopic", () => {
  it("finds a shared topic with its category", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createTopic(category.id, "Shared");

    expect(await findTopic(user.id, topic.id)).toEqual({ id: topic.id, text: "Shared", category: "a" });
  });

  it("finds the user's own custom topic", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const topic = await createCustomTopic(user.id, category.id, "Mine");

    expect(await findTopic(user.id, topic.id)).toEqual({ id: topic.id, text: "Mine", category: "a" });
  });

  it("returns null for another user's custom topic or an unknown id", async () => {
    const user = await createUser();
    const category = await createCategory("a");
    const theirs = await createCustomTopic((await createUser()).id, category.id, "Theirs");

    expect(await findTopic(user.id, theirs.id)).toBeNull();
    expect(await findTopic(user.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
