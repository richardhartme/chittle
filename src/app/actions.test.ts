import { randomBytes } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessments, magicLinks, providerKeys, recordings, sessions, transcripts, userSeenTopics, users } from "@/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import { signIn } from "@/test/auth";
import { createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";
import { claudeReplies, stream } from "@/test/claude";
import { judgementFixture, wordsOf } from "@/test/judgement";
import { saveTestKeys } from "@/test/keys";
import { after, afterSettled, cookieJar, redirectedTo, refresh, resetNextMocks } from "@/test/next";
import { streamOf, withTempStorage } from "@/test/storage";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);
vi.mock("@/lib/auth/email", () => ({ sendMagicLinkEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", async () => (await import("@/test/next")).cacheMock);
vi.mock("next/server", async () => (await import("@/test/next")).serverMock);

const listModels = vi.fn();
vi.mock("@anthropic-ai/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@anthropic-ai/sdk")>()),
  // Listing models checks a key; streaming a message judges a recording.
  default: vi.fn(function (this: { models: { list: typeof listModels }; beta: unknown }) {
    this.models = { list: listModels };
    this.beta = { messages: { stream } };
  }),
}));

import Anthropic, { APIConnectionError, AuthenticationError, PermissionDeniedError } from "@anthropic-ai/sdk";
import { sendMagicLinkEmail } from "@/lib/auth/email";
import { getProviderKeys } from "@/lib/provider-keys";
import {
  assessRecording,
  deleteAccount,
  deleteRecording,
  logout,
  removeProviderKey,
  requestLoginLink,
  saveProviderKey,
  setFocusVote,
  verifyLoginLink,
} from "./actions";
import { measure } from "@/lib/assessment/measure";
import { scoreJudgement } from "@/lib/assessment/score";
import { SCORING_VERSION } from "@/lib/assessment/version";
import { focusVotesOn } from "@/lib/focus-votes";

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
      error: "Couldn't send your sign-in link. Try again.",
    });
  });
});

describe("verifyLoginLink", () => {
  async function issueToken(email = "a@example.com") {
    await requestLoginLink(undefined, form({ email }));
    const link = vi.mocked(sendMagicLinkEmail).mock.calls.at(-1)![1];
    return new URL(link).searchParams.get("token")!;
  }

  it("signs the user in and redirects to the dashboard", async () => {
    const token = await issueToken();

    expect(await redirectedTo(() => verifyLoginLink(form({ token })))).toBe("/");

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

describe("assessRecording", () => {
  let topicId: string;

  beforeEach(async () => {
    topicId = (await createTopic((await createCategory("a")).id, "A topic")).id;
    stream.mockClear();
    claudeReplies(judgementFixture());
  });

  const assessmentOf = async (recordingId: string) =>
    (await db.select().from(assessments).where(eq(assessments.recordingId, recordingId)))[0];

  /** A recording assessed at scoring version 1, with its transcript stored. */
  async function assessedRecording(userId: string) {
    const recording = await createRecording(userId, topicId);
    const text = "We should ship it now because the tests pass.";
    await db.insert(transcripts).values({ recordingId: recording.id, text, words: wordsOf(text), audioSeconds: 4 });
    await db.insert(assessments).values({
      recordingId: recording.id,
      status: "done",
      startedAt: new Date(Date.now() - 60_000),
      completedAt: new Date(),
      scoringVersion: 1,
      pronunciationScore: 1,
      fillerRateScore: 1,
      paceScore: 1,
    });
    return recording;
  }

  it("requires sign-in", async () => {
    expect(await redirectedTo(() => assessRecording(form({})))).toBe("/login");
  });

  it("re-assesses a done recording from its stored transcript, without calling Deepgram", async () => {
    const user = await signIn();
    await saveTestKeys(user.id);
    const recording = await assessedRecording(user.id);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await assessRecording(form({ recordingId: recording.id }));
    await afterSettled();

    expect(after).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(2);
    const row = await assessmentOf(recording.id);
    expect(row).toMatchObject({ status: "done", error: null, scoringVersion: SCORING_VERSION, structureScore: 200 });
    expect(row.pronunciationScore).toBe(150); // every word heard clearly, no longer the old 1
    expect(row.result?.judged?.overview).toBe("A clear answer that could open more strongly.");
    expect(refresh).toHaveBeenCalled();
  });

  it("doesn't re-assess another speaker's recording", async () => {
    const other = await createUser();
    await saveTestKeys(other.id);
    const recording = await assessedRecording(other.id);
    await signIn();

    await assessRecording(form({ recordingId: recording.id }));

    expect(after).not.toHaveBeenCalled();
    expect(await assessmentOf(recording.id)).toMatchObject({ status: "done", scoringVersion: 1 });
  });
});

describe("setFocusVote", () => {
  const areas = ["Open with your point", "Cut the hedges"];

  /** A recording whose done assessment lists `areas` as its areas to improve. */
  async function judgedRecording(userId: string) {
    const topic = await createTopic((await createCategory()).id);
    const recording = await createRecording(userId, topic.id);
    const words = wordsOf("We should ship it now.");
    const measured = measure(words, 2);
    const { judged } = scoreJudgement({ judgement: judgementFixture({ areasToImprove: areas }), measured, words, durationSeconds: 2 });
    await db.insert(assessments).values({
      recordingId: recording.id,
      status: "done",
      startedAt: new Date(Date.now() - 60_000),
      completedAt: new Date(),
      scoringVersion: 3,
      result: { measured, judged },
    });
    return recording;
  }

  it("stores a vote on an area to improve", async () => {
    const user = await signIn();
    const recording = await judgedRecording(user.id);

    expect(await setFocusVote(recording.id, "Cut the hedges", "up")).toEqual({ saved: true });

    expect(await focusVotesOn(user.id, recording.id)).toEqual({ "Cut the hedges": "up" });
  });

  it("changes a vote, and clears it", async () => {
    const user = await signIn();
    const recording = await judgedRecording(user.id);
    await setFocusVote(recording.id, "Cut the hedges", "up");
    await setFocusVote(recording.id, "Open with your point", "up");

    expect(await setFocusVote(recording.id, "Cut the hedges", "down")).toEqual({ saved: true });
    expect(await focusVotesOn(user.id, recording.id)).toEqual({ "Cut the hedges": "down", "Open with your point": "up" });

    expect(await setFocusVote(recording.id, "Cut the hedges", null)).toEqual({ saved: true });
    expect(await focusVotesOn(user.id, recording.id)).toEqual({ "Open with your point": "up" });
  });

  it("requires sign-in", async () => {
    expect(await redirectedTo(() => setFocusVote(crypto.randomUUID(), "Cut the hedges", "up"))).toBe("/login");
  });

  it("refuses another speaker's recording", async () => {
    const other = await createUser();
    const recording = await judgedRecording(other.id);
    await signIn();

    expect(await setFocusVote(recording.id, "Cut the hedges", "up")).toEqual({ error: expect.any(String) });
    expect(await focusVotesOn(other.id, recording.id)).toEqual({});
  });

  it("refuses an area that isn't in the assessment", async () => {
    const user = await signIn();
    const recording = await judgedRecording(user.id);

    expect(await setFocusVote(recording.id, "Speak more slowly", "up")).toEqual({ error: expect.any(String) });
    expect(await focusVotesOn(user.id, recording.id)).toEqual({});
  });

  it("refuses a recording that isn't assessed, and a malformed vote", async () => {
    const user = await signIn();
    const recording = await createRecording(user.id, (await createTopic((await createCategory()).id)).id);
    const judged = await judgedRecording(user.id);

    expect(await setFocusVote(recording.id, "Cut the hedges", "up")).toEqual({ error: expect.any(String) });
    expect(await setFocusVote(judged.id, "Cut the hedges", "sideways" as never)).toEqual({ error: expect.any(String) });
    expect(await setFocusVote("nope", "Cut the hedges", "up")).toEqual({ error: expect.any(String) });
    expect(await focusVotesOn(user.id, judged.id)).toEqual({});
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
    await db
      .insert(providerKeys)
      .values({ userId: user.id, provider: "deepgram", encryptedKey: "ciphertext", keyHint: "abcd" });

    expect(await redirectedTo(() => deleteAccount(form({ confirm: "me@example.com" })))).toBe("/");

    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(recordings)).toHaveLength(0);
    expect(await db.select().from(userSeenTopics)).toHaveLength(0);
    expect(await db.select().from(providerKeys)).toHaveLength(0);
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

describe("saveProviderKey", () => {
  const deepgramFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    deepgramFetch.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", deepgramFetch);
    listModels.mockReset().mockResolvedValue({ data: [] });
  });

  const save = (fields: Record<string, string>) => saveProviderKey(undefined, form(fields));

  it("checks a Deepgram key against Deepgram and stores it encrypted with its last four characters", async () => {
    const user = await signIn();

    expect(await save({ provider: "deepgram", key: "dg-secret-abcd" })).toEqual({ saved: true });

    const [url, init] = deepgramFetch.mock.calls[0];
    expect(String(url)).toBe("https://api.deepgram.com/v1/projects");
    expect(new Headers(init?.headers).get("authorization")).toBe("Token dg-secret-abcd");

    const [row] = await db.select().from(providerKeys);
    expect(row).toMatchObject({ userId: user.id, provider: "deepgram", keyHint: "abcd" });
    expect(row.encryptedKey).not.toContain("dg-secret");
    expect(refresh).toHaveBeenCalled();
  });

  it("checks an Anthropic key by listing models with it", async () => {
    const user = await signIn();

    expect(await save({ provider: "anthropic", key: "sk-ant-secret-wxyz" })).toEqual({ saved: true });

    expect(Anthropic).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: "sk-ant-secret-wxyz" }));
    expect(listModels).toHaveBeenCalled();
    expect(await getProviderKeys(user.id)).toEqual({ anthropic: "sk-ant-secret-wxyz" });
  });

  it("trims whitespace pasted around the key", async () => {
    const user = await signIn();
    await save({ provider: "deepgram", key: "  dg-secret-abcd\n" });
    expect(await getProviderKeys(user.id)).toEqual({ deepgram: "dg-secret-abcd" });
  });

  it.each([401, 403])("rejects a Deepgram key the provider answers %i to, without storing it", async (status) => {
    await signIn();
    deepgramFetch.mockResolvedValue(new Response("{}", { status }));

    expect(await save({ provider: "deepgram", key: "dg-wrong" })).toEqual({ error: "The provider rejected that key." });
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it.each([
    ["401", new AuthenticationError(401, undefined, "invalid x-api-key", new Headers())],
    ["403", new PermissionDeniedError(403, undefined, "forbidden", new Headers())],
  ])("rejects an Anthropic key the provider answers %s to, without storing it", async (_status, error) => {
    await signIn();
    listModels.mockRejectedValue(error);

    expect(await save({ provider: "anthropic", key: "sk-wrong" })).toEqual({ error: "The provider rejected that key." });
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it("asks to try again, without storing the key, when Deepgram can't be reached or fails", async () => {
    await signIn();
    deepgramFetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await save({ provider: "deepgram", key: "dg-secret-abcd" })).toEqual({
      error: "Couldn't check the key. Try again.",
    });

    deepgramFetch.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    expect(await save({ provider: "deepgram", key: "dg-secret-abcd" })).toEqual({
      error: "Couldn't check the key. Try again.",
    });
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it("asks to try again, without storing the key, when Anthropic can't be reached", async () => {
    await signIn();
    listModels.mockRejectedValue(new APIConnectionError({ message: "Connection error." }));

    expect(await save({ provider: "anthropic", key: "sk-ant" })).toEqual({ error: "Couldn't check the key. Try again." });
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it("replaces an earlier key for the same provider", async () => {
    const user = await signIn();
    await save({ provider: "deepgram", key: "dg-old-1111" });
    await save({ provider: "deepgram", key: "dg-new-2222" });

    const rows = await db.select().from(providerKeys);
    expect(rows).toHaveLength(1);
    expect(rows[0].keyHint).toBe("2222");
    expect(await getProviderKeys(user.id)).toEqual({ deepgram: "dg-new-2222" });
  });

  it.each([
    ["isn't set", ""],
    ["is the wrong length", randomBytes(16).toString("base64")],
  ])("fails clearly, without calling the provider, when ENCRYPTION_KEY %s", async (_case, value) => {
    await signIn();
    vi.stubEnv("ENCRYPTION_KEY", value);

    expect(await save({ provider: "deepgram", key: "dg-secret-abcd" })).toEqual({
      error: "This server can't save keys because its ENCRYPTION_KEY is missing or invalid.",
    });
    expect(deepgramFetch).not.toHaveBeenCalled();
    expect(await db.select().from(providerKeys)).toHaveLength(0);
  });

  it("rejects an empty key or an unknown provider", async () => {
    await signIn();
    expect(await save({ provider: "deepgram", key: "   " })).toEqual({ error: "Paste a key to save." });
    expect(await save({ provider: "openai", key: "sk-x" })).toEqual({ error: "Unknown provider." });
    expect(deepgramFetch).not.toHaveBeenCalled();
  });

  it("requires sign-in", async () => {
    expect(await redirectedTo(() => save({ provider: "deepgram", key: "dg" }))).toBe("/login");
  });
});

describe("removeProviderKey", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    listModels.mockReset().mockResolvedValue({ data: [] });
  });

  it("removes only the signed-in speaker's key for that provider", async () => {
    await signIn();
    await saveProviderKey(undefined, form({ provider: "deepgram", key: "dg-other-1111" }));
    await signIn();
    await saveProviderKey(undefined, form({ provider: "deepgram", key: "dg-mine-2222" }));
    await saveProviderKey(undefined, form({ provider: "anthropic", key: "sk-mine-3333" }));

    await removeProviderKey(form({ provider: "deepgram" }));

    const rows = await db.select().from(providerKeys);
    expect(rows.map((r) => `${r.provider}:${r.keyHint}`).sort()).toEqual(["anthropic:3333", "deepgram:1111"]);
  });

  it("requires sign-in", async () => {
    expect(await redirectedTo(() => removeProviderKey(form({ provider: "deepgram" })))).toBe("/login");
  });
});
