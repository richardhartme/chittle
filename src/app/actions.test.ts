import { stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { magicLinks, recordings, sessions, userSeenTopics, users } from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { signIn } from "@/test/auth";
import { createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";
import { cookieJar, redirectedTo, resetNextMocks } from "@/test/next";
import { streamOf, withTempStorage } from "@/test/storage";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);
vi.mock("@/lib/auth/email", () => ({ sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined) }));

import { sendMagicLinkEmail } from "@/lib/auth/email";
import {
  deleteAccount,
  deleteRecording,
  logout,
  requestLoginLink,
  verifyLoginLink,
} from "./actions";

const temp = withTempStorage();

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
  vi.mocked(sendMagicLinkEmail).mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("requestLoginLink", () => {
  it("emails a link and reports success", async () => {
    expect(await requestLoginLink(undefined, form({ email: "a@example.com" }))).toEqual({ sent: true });

    expect(sendMagicLinkEmail).toHaveBeenCalledWith("a@example.com", expect.stringContaining("/auth/verify?token="));
    expect(await db.select().from(magicLinks)).toHaveLength(1);
  });

  it("normalises the address", async () => {
    await requestLoginLink(undefined, form({ email: "  Ada@Example.COM " }));
    expect(sendMagicLinkEmail).toHaveBeenCalledWith("ada@example.com", expect.any(String));
  });

  it.each(["", "not-an-email", "a@", "@example.com", "a b@example.com"])("rejects %j", async (email) => {
    expect(await requestLoginLink(undefined, form({ email }))).toEqual({ error: "Enter a valid email address." });
    expect(sendMagicLinkEmail).not.toHaveBeenCalled();
  });

  it("rejects a missing email field", async () => {
    expect(await requestLoginLink(undefined, new FormData())).toEqual({ error: "Enter a valid email address." });
  });

  it("returns a friendly error if sending fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMagicLinkEmail).mockRejectedValue(new Error("smtp down"));

    expect(await requestLoginLink(undefined, form({ email: "a@example.com" }))).toEqual({
      error: "We couldn't send your sign-in link. Please try again.",
    });
  });
});

describe("verifyLoginLink", () => {
  async function issueToken(email = "a@example.com") {
    await requestLoginLink(undefined, form({ email }));
    const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
    return new URL(link).searchParams.get("token")!;
  }

  it("signs the user in and redirects to /practice", async () => {
    const token = await issueToken();

    expect(await redirectedTo(() => verifyLoginLink(form({ token })))).toBe("/practice");

    const [user] = await db.select().from(users);
    expect(user.email).toBe("a@example.com");
    const [session] = await db.select().from(sessions);
    expect(session.userId).toBe(user.id);
    expect(session.tokenHash).toBe(hashToken(cookieJar.get("chittle_session")!.value));
  });

  it("redirects to the login page for an invalid token", async () => {
    expect(await redirectedTo(() => verifyLoginLink(form({ token: "bogus" })))).toBe("/login?error=invalid");
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(cookieJar.size).toBe(0);
  });

  it("redirects to the login page when no token is given", async () => {
    expect(await redirectedTo(() => verifyLoginLink(new FormData()))).toBe("/login?error=invalid");
  });

  it("rejects a token that has already been used", async () => {
    const token = await issueToken();
    await redirectedTo(() => verifyLoginLink(form({ token })));

    expect(await redirectedTo(() => verifyLoginLink(form({ token })))).toBe("/login?error=invalid");
    expect(await db.select().from(sessions)).toHaveLength(1);
  });
});

describe("logout", () => {
  it("ends the session and redirects home", async () => {
    await signIn();

    expect(await redirectedTo(logout)).toBe("/");

    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(cookieJar.has("chittle_session")).toBe(false);
  });
});

describe("deleteRecording", () => {
  let topicId: string;

  beforeEach(async () => {
    topicId = (await createTopic((await createCategory("a")).id, "A topic")).id;
  });

  const exists = (key: string) =>
    stat(path.join(temp.root, key)).then(
      () => true,
      () => false,
    );

  it("requires sign-in", async () => {
    expect(await redirectedTo(() => deleteRecording(form({})))).toBe("/login");
  });

  it("deletes the row and the stored file, then redirects to the library", async () => {
    const user = await signIn();
    const recording = await createRecording(user.id, topicId);
    await temp.storage().put(recording.storageKey, streamOf("video"));

    expect(await redirectedTo(() => deleteRecording(form({ recordingId: recording.id })))).toBe("/library");

    expect(await db.select().from(recordings)).toHaveLength(0);
    expect(await exists(recording.storageKey)).toBe(false);
  });

  it("does not touch another user's recording", async () => {
    const other = await createUser();
    const recording = await createRecording(other.id, topicId);
    await temp.storage().put(recording.storageKey, streamOf("video"));
    await signIn();

    expect(await redirectedTo(() => deleteRecording(form({ recordingId: recording.id })))).toBe("/library");

    expect(await db.select().from(recordings)).toHaveLength(1);
    expect(await exists(recording.storageKey)).toBe(true);
  });

  it("redirects for an invalid id without deleting anything", async () => {
    const user = await signIn();
    await createRecording(user.id, topicId);

    expect(await redirectedTo(() => deleteRecording(form({ recordingId: "nope" })))).toBe("/library");
    expect(await redirectedTo(() => deleteRecording(new FormData()))).toBe("/library");
    expect(await db.select().from(recordings)).toHaveLength(1);
  });

  it("keeps the row if deleting the file fails, so it can be retried", async () => {
    const user = await signIn();
    const recording = await createRecording(user.id, topicId);
    vi.spyOn(temp.storage(), "delete").mockRejectedValueOnce(new Error("disk error"));

    await expect(deleteRecording(form({ recordingId: recording.id }))).rejects.toThrow("disk error");

    expect(await db.select().from(recordings)).toHaveLength(1);
  });
});

describe("deleteAccount", () => {
  let topicId: string;

  beforeEach(async () => {
    topicId = (await createTopic((await createCategory("a")).id, "A topic")).id;
  });

  it("requires sign-in", async () => {
    expect(await redirectedTo(() => deleteAccount(form({})))).toBe("/login");
  });

  it("refuses unless the email is typed to confirm", async () => {
    const user = await signIn("me@example.com");

    expect(await redirectedTo(() => deleteAccount(form({ confirm: "someone@else.com" })))).toBe(
      "/account?error=confirm",
    );
    expect(await redirectedTo(() => deleteAccount(new FormData()))).toBe("/account?error=confirm");

    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1);
  });

  it("deletes the account, everything it owns and its stored files", async () => {
    const user = await signIn("me@example.com");
    const recording = await createRecording(user.id, topicId);
    await temp.storage().put(recording.storageKey, streamOf("video"));
    await db.insert(userSeenTopics).values({ userId: user.id, topicId });

    expect(await redirectedTo(() => deleteAccount(form({ confirm: "me@example.com" })))).toBe("/");

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(recordings)).toHaveLength(0);
    expect(await db.select().from(userSeenTopics)).toHaveLength(0);
    await expect(stat(path.join(temp.root, user.id))).rejects.toThrow();
    expect(cookieJar.has("chittle_session")).toBe(false);
  });

  it("leaves other users' data alone", async () => {
    const other = await createUser();
    const otherRecording = await createRecording(other.id, topicId);
    await temp.storage().put(otherRecording.storageKey, streamOf("video"));
    await signIn("me@example.com");

    await redirectedTo(() => deleteAccount(form({ confirm: "me@example.com" })));

    expect((await db.select().from(users)).map((u) => u.id)).toEqual([other.id]);
    expect(await db.select().from(recordings)).toHaveLength(1);
    await expect(stat(path.join(temp.root, otherRecording.storageKey))).resolves.toBeDefined();
  });
});
