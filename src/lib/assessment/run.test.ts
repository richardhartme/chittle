import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessments, transcripts } from "@/db/schema";
import { createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";
import { streamOf, withTempStorage } from "@/test/storage";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

import { claimAssessment } from "./claim";
import { runAssessment } from "./run";

const temp = withTempStorage();
const keys = { deepgram: "dg-secret-key", anthropic: "sk-secret-key" };

let recordingId: string;
let claim: Date;

beforeEach(async () => {
  await resetDb();
  const user = await createUser();
  const topic = await createTopic((await createCategory()).id);
  const recording = await createRecording(user.id, topic.id, { mimeType: "audio/webm" });
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

  it("measures the transcript and stores the measured scores and metrics, leaving the total for judging", async () => {
    deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    const row = await assessment();
    expect(row).toMatchObject({
      status: "done",
      scoringVersion: 1,
      fillerRateScore: 0, // 1 filler in 2 words
      pronunciationScore: 150, // "hello" heard clearly
      totalScore: null,
      structureScore: null,
      concisenessScore: null,
      confidenceScore: null,
    });
    const { measured } = row.result as { measured: { fillers: unknown; subScores: Record<string, number> } };
    expect(measured.fillers).toMatchObject({ total: 1, breakdown: [{ word: "um", count: 1 }] });
    expect(row.paceScore).toBe(measured.subScores.pauseTiming + measured.subScores.wordsPerMinute);
  });

  it("measures an already-stored transcript", async () => {
    const words = [{ word: "hello", punctuated_word: "Hello.", start: 0, end: 0.5, confidence: 0.5 }];
    await db.insert(transcripts).values({ recordingId, text: "Hello.", words, audioSeconds: 1 });
    deepgramReplies(success());

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "done", scoringVersion: 1, pronunciationScore: 0 });
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
    [429, "Deepgram is busy, try again in a minute."],
    [500, "Deepgram couldn't transcribe the recording, try again."],
  ])("marks the assessment failed when Deepgram answers %i", async (status, message) => {
    deepgramReplies({ err_code: "X", err_msg: "nope" }, status);

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: message });
    expect(await transcript()).toBeUndefined();
  });

  it("marks the assessment failed when no speech was detected", async () => {
    deepgramReplies(success("", []));

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: "No speech was detected." });
    expect(await transcript()).toBeUndefined();
  });

  it("marks the assessment failed when Deepgram can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

    await runAssessment(recordingId, claim, keys);

    expect(await assessment()).toMatchObject({ status: "failed", error: "Couldn't reach Deepgram, try again." });
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
});
