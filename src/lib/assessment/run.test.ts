import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessments, focusVotes, progressInsights, transcripts } from "@/db/schema";
import { createAssessedRecording, createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";
import { claudeFails, claudeReplies, claudeRepliesInTurn, stream } from "@/test/claude";
import { judgementFixture } from "@/test/judgement";
import { streamOf, withTempStorage } from "@/test/storage";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("@anthropic-ai/sdk", async (importOriginal) => (await import("@/test/claude")).anthropicMock(importOriginal));

import Anthropic, { AuthenticationError, InternalServerError } from "@anthropic-ai/sdk";
import { claimAssessment } from "./claim";
import { scoringSchema } from "./judgement";
import { runAssessment } from "./run";
import { SCORING_VERSION } from "./version";

const temp = withTempStorage();
const keys = { deepgram: "dg-secret-key", anthropic: "sk-secret-key" };

let userId: string;
let topicId: string;
let recordingId: string;
let claim: Date;

beforeEach(async () => {
  await resetDb();
  vi.mocked(Anthropic).mockClear();
  stream.mockClear();
  claudeReplies(judgementFixture());
  const user = await createUser();
  const category = await createCategory("interview", "Interview", "star");
  const topic = await createTopic(category.id, "Tell me about a project you are proud of.");
  const recording = await createRecording(user.id, topic.id, { mimeType: "audio/webm" });
  userId = user.id;
  topicId = topic.id;
  await temp.storage().put(recording.storageKey, streamOf("audio-bytes"));
  recordingId = recording.id;
  claim = (await claimAssessment(recordingId))!;
});

const deepgramWords = [
  { word: "um", punctuated_word: "Um,", start: 0.1, end: 0.3, confidence: 0.91 },
  { word: "hello", punctuated_word: "hello.", start: 0.4, end: 0.9, confidence: 0.99 },
];

function deepgramReplies(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const success = (transcript = "Um, hello.", words = deepgramWords) => ({
  metadata: { duration: 1.25 },
  results: { channels: [{ alternatives: [{ transcript, confidence: 0.95, words }] }] },
});

const assessment = async () => (await db.select().from(assessments).where(eq(assessments.recordingId, recordingId)))[0];
const transcript = async () => (await db.select().from(transcripts).where(eq(transcripts.recordingId, recordingId)))[0];

describe("runAssessment", () => {
  it("sends the stored file to Deepgram's pre-recorded endpoint with the right parameters", async () => {
    const fetch = deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    const sent = new URL(url);
    expect(sent.origin + sent.pathname).toBe("https://api.deepgram.com/v1/listen");
    expect(Object.fromEntries(sent.searchParams)).toEqual({
      model: "nova-3",
      language: "en",
      filler_words: "true",
      punctuate: "true",
    });
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe("Token dg-secret-key");
    expect(new Headers(init.headers).get("Content-Type")).toBe("audio/webm");
    expect(await new Response(init.body).text()).toBe("audio-bytes");
  });

  it("stores the transcript and marks the assessment done", async () => {
    deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    expect(await transcript()).toMatchObject({ text: "Um, hello.", words: deepgramWords, audioSeconds: 1.25 });
    const row = await assessment();
    expect(row).toMatchObject({ status: "done", error: null });
    expect(row.completedAt).toBeInstanceOf(Date);
  });

  it("judges the recording with Claude, using the speaker's Anthropic key and the category's framework", async () => {
    deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "sk-secret-key" }));
    // The scoring and the coach insights, asked for at once.
    expect(stream).toHaveBeenCalledTimes(2);
    const request = stream.mock.calls[0][0];
    expect(request).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema" } },
    });
    const message = request.messages[0].content;
    expect(message).toContain("Tell me about a project you are proud of.");
    expect(message).toContain("STAR");
    expect(message).toContain("Um, hello.");
  });

  it("gives Claude the speaker's 20 most recent focus votes, newest first, and nobody else's", async () => {
    deepgramReplies(success());
    const earlier = await createRecording(userId, topicId);
    // 22 votes, a minute apart: "Area 21" is the newest, and "Area 0" and "Area 1" are too old to send.
    await db.insert(focusVotes).values(
      Array.from({ length: 22 }, (_, i) => ({
        userId,
        recordingId: earlier.id,
        area: `Area ${i}`,
        vote: i % 2 ? ("up" as const) : ("down" as const),
        createdAt: new Date(Date.UTC(2026, 10, 1, 9, i)),
      })),
    );
    const other = await createUser();
    await db.insert(focusVotes).values({
      userId: other.id,
      recordingId: (await createRecording(other.id, topicId)).id,
      area: "Someone else's area",
      vote: "up",
    });

    await runAssessment(recordingId, claim, keys);

    const message: string = stream.mock.calls[0][0].messages[0].content;
    /** The areas listed under a heading, in order. */
    const listed = (heading: string) => {
      const lines = message.split(`${heading}\n`)[1].split("\n");
      return lines.slice(0, lines.findIndex((line) => !line.startsWith("- "))).map((line) => line.slice(2));
    };
    expect(listed("Areas I want to work on:")).toEqual([21, 19, 17, 15, 13, 11, 9, 7, 5, 3].map((i) => `Area ${i}`));
    expect(listed("Feedback I didn't find useful:")).toEqual([20, 18, 16, 14, 12, 10, 8, 6, 4, 2].map((i) => `Area ${i}`));
    expect(message).not.toContain("Someone else's area");
  });

  it("stores a done assessment with every score, the total, the feedback and the coach insights, at the current scoring version", async () => {
    deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    const row = await assessment();
    expect(row).toMatchObject({
      status: "done",
      error: null,
      scoringVersion: SCORING_VERSION,
      structureScore: 200, // five sub-scores of 40
      concisenessScore: 120,
      confidenceScore: 80,
      pronunciationScore: 150, // "hello" heard clearly
      fillerRateScore: 0, // 1 filler in 2 words
      paceScore: 0, // too few words to have a pace
      totalScore: 550,
    });
    expect(row.result?.measured.fillers).toMatchObject({ total: 1, breakdown: [{ word: "um", count: 1 }] });
    expect(row.result?.judged).toMatchObject({
      overview: "A clear answer that could open more strongly.",
      strengths: ["Clear example"],
      areasToImprove: ["Open with your point", "Cut the hedges"],
      dimensions: { structure: { summary: "Structure summary." } },
      coachInsights: {
        summary: "Lead with your recommendation; you saved it for the end.",
        tryOpeningWith: "We should ship it now.",
        idealVersion: [{ step: "Point" }, { step: "Reason" }],
      },
    });
  });

  it("marks the assessment failed when Anthropic rejects the key", async () => {
    deepgramReplies(success());
    claudeFails(new AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers()));

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: "Anthropic rejected the key.", totalScore: null });
    expect(await transcript()).toBeDefined(); // kept, so Retry needn't transcribe again
  });

  it("marks the assessment failed when Claude declines to assess it", async () => {
    deepgramReplies(success());
    claudeReplies("", "refusal");

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: "Claude declined to assess this recording." });
  });

  it.each([
    ["Claude errors", () => claudeFails(new InternalServerError(500, { type: "error" }, "overloaded", new Headers()))],
    ["Claude's reply is cut off", () => claudeReplies('{"structure":', "max_tokens")],
    ["Claude's reply doesn't match the schema", () => claudeReplies({ overview: "Only this." })],
  ])("marks the assessment failed with a generic message when %s", async (_, arrange) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    deepgramReplies(success());
    arrange();

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({
      status: "failed",
      error: "Something went wrong while assessing this recording. Try again.",
    });
    log.mockRestore();
  });

  it("marks the assessment failed when only the coach insights fail", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    deepgramReplies(success());
    claudeRepliesInTurn(scoringSchema.parse(judgementFixture()),new InternalServerError(500, { type: "error" }, "overloaded", new Headers()));

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", totalScore: null });
    log.mockRestore();
  });

  it("measures an already-stored transcript", async () => {
    const words = [{ word: "hello", punctuated_word: "Hello.", start: 0, end: 0.5, confidence: 0.5 }];
    await db.insert(transcripts).values({ recordingId, text: "Hello.", words, audioSeconds: 1 });
    deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "done", scoringVersion: SCORING_VERSION, pronunciationScore: 0 });
  });

  it("falls back to the plain word when Deepgram leaves out the punctuated one", async () => {
    deepgramReplies(success("hello", [{ word: "hello", start: 0, end: 0.5, confidence: 0.9 }] as never));

    await runAssessment(recordingId, claim, keys);

    expect((await transcript()).words).toEqual([
      { word: "hello", punctuated_word: "hello", start: 0, end: 0.5, confidence: 0.9 },
    ]);
  });

  it("doesn't call Deepgram again when the recording already has a transcript", async () => {
    await db.insert(transcripts).values({ recordingId, text: "Already here.", words: [], audioSeconds: 3 });
    const fetch = deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    expect(fetch).not.toHaveBeenCalled();
    expect((await transcript()).text).toBe("Already here.");
    expect((await assessment()).status).toBe("done");
  });

  it.each([
    [401, "Deepgram rejected the key."],
    [402, "Your Deepgram account is out of credit."],
    [400, "Deepgram couldn't read the recording's audio."],
    [429, "Deepgram is busy. Try again in a minute."],
    [500, "Deepgram couldn't transcribe the recording. Try again."],
  ])("marks the assessment failed when Deepgram answers %i", async (status, message) => {
    deepgramReplies({ err_code: "X", err_msg: "nope" }, status);

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: message });
    expect(await transcript()).toBeUndefined();
  });

  it("marks the assessment failed when no speech was detected", async () => {
    deepgramReplies(success("", []));

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: "Deepgram heard no speech in the recording." });
    expect(await transcript()).toBeUndefined();
  });

  it("marks the assessment failed when Deepgram can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: "Couldn't reach Deepgram. Try again." });
  });

  it("marks the assessment failed when the recording's file is missing", async () => {
    const fetch = deepgramReplies(success());
    await temp.storage().deletePrefix("");

    await runAssessment(recordingId, claim, keys);

    expect(fetch).not.toHaveBeenCalled();
    expect(await assessment()).toMatchObject({ status: "failed", error: "The recording's file is missing." });
  });

  it("never puts a key in the stored error or the logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`boom ${keys.deepgram}`)));

    await runAssessment(recordingId, claim, keys);

    expect((await assessment()).error).not.toContain(keys.deepgram);
    expect(JSON.stringify(log.mock.calls)).not.toContain(keys.deepgram);
    log.mockRestore();
  });

  it("never puts the Anthropic key in the stored error or the logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    deepgramReplies(success());
    claudeFails(new Error(`boom ${keys.anthropic}`));

    await runAssessment(recordingId, claim, keys);

    expect((await assessment()).error).not.toContain(keys.anthropic);
    expect(JSON.stringify(log.mock.calls)).not.toContain(keys.anthropic);
    log.mockRestore();
  });

  it("leaves a newer claim alone when an older run finishes after Retry took over", async () => {
    deepgramReplies(success());
    await db
      .update(assessments)
      .set({ startedAt: sql`now() - interval '6 minutes'` })
      .where(eq(assessments.recordingId, recordingId));
    const stale = (await assessment()).startedAt;
    const retry = await claimAssessment(recordingId);
    expect(retry).not.toBeNull();

    await runAssessment(recordingId, stale, keys);

    expect(await assessment()).toMatchObject({ status: "pending", startedAt: retry });
  });

  describe("progress insight", () => {
    const insight = async () => (await db.select().from(progressInsights).where(eq(progressInsights.userId, userId)))[0];
    const insightRequests = () =>
      stream.mock.calls.map(([request]) => request).filter((request) => "insight" in (request.output_config.format.schema.properties ?? {}));

    it("is refreshed with Claude, using the speaker's key, once the speaker has two assessments", async () => {
      deepgramReplies(success());
      await createAssessedRecording(userId, topicId, { createdAt: new Date(Date.UTC(2026, 10, 1)) });
      claudeRepliesInTurn(judgementFixture(), { insight: "Your Structure is up 50 points on last time." });

      await runAssessment(recordingId, claim, keys);

      expect((await assessment()).status).toBe("done");
      expect(stream).toHaveBeenCalledTimes(3);
      expect(Anthropic).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: "sk-secret-key" }));
      const [request] = insightRequests();
      expect(request.model).toBe("claude-opus-5-5");
      // Both assessments: the earlier one, and the one just finished with its total of 550.
      expect(request.messages[0].content).toMatch(/1\. 1 Nov 2026.*650\/1000[\s\S]*2\. .*550\/1000/);
      expect(await insight()).toMatchObject({ text: "Your Structure is up 50 points on last time." });
    });

    it("is asked for once, without the SDK's automatic retries, so a failure isn't billed to the speaker again", async () => {
      deepgramReplies(success());
      await createAssessedRecording(userId, topicId);
      claudeRepliesInTurn(judgementFixture(), { insight: "An insight." });

      await runAssessment(recordingId, claim, keys);

      expect(insightRequests()).toHaveLength(1);
      expect(Anthropic).toHaveBeenLastCalledWith(expect.objectContaining({ apiKey: "sk-secret-key", maxRetries: 0 }));
    });

    it("replaces the speaker's previous insight", async () => {
      deepgramReplies(success());
      await createAssessedRecording(userId, topicId);
      const old = new Date(Date.UTC(2026, 10, 1));
      await db.insert(progressInsights).values({ userId, text: "An old insight.", generatedAt: old });
      claudeRepliesInTurn(judgementFixture(), { insight: "A fresh insight." });

      await runAssessment(recordingId, claim, keys);

      const row = await insight();
      expect(row.text).toBe("A fresh insight.");
      expect(row.generatedAt.getTime()).toBeGreaterThan(old.getTime());
    });

    it("isn't asked for when this is the speaker's first assessment", async () => {
      deepgramReplies(success());

      await runAssessment(recordingId, claim, keys);

      expect(stream).toHaveBeenCalledTimes(2);
      expect(insightRequests()).toEqual([]);
      expect(await insight()).toBeUndefined();
    });

    it("isn't asked for when the assessment fails", async () => {
      deepgramReplies(success());
      await createAssessedRecording(userId, topicId);
      claudeFails(new AuthenticationError(401, { type: "error" }, "invalid x-api-key", new Headers()));

      await runAssessment(recordingId, claim, keys);

      expect(insightRequests()).toEqual([]);
    });

    it.each([
      ["Claude errors", new InternalServerError(500, { type: "error" }, `overloaded ${keys.anthropic}`, new Headers())],
      ["Claude's reply doesn't match the schema", { notAnInsight: true }],
    ])("leaves the assessment done and the previous insight in place when %s, and logs it without the key", async (_, reply) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      deepgramReplies(success());
      await createAssessedRecording(userId, topicId);
      const old = new Date(Date.UTC(2026, 10, 1));
      await db.insert(progressInsights).values({ userId, text: "An old insight.", generatedAt: old });
      claudeRepliesInTurn(judgementFixture(), reply);

      await runAssessment(recordingId, claim, keys);

      expect(await assessment()).toMatchObject({ status: "done", error: null, totalScore: 550 });
      expect(await insight()).toMatchObject({ text: "An old insight.", generatedAt: old });
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain(keys.anthropic);
      log.mockRestore();
    });
  });
});
