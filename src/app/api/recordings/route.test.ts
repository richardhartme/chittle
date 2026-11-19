import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessments, recordings, transcripts } from "@/db/schema";
import { SCORING_VERSION } from "@/lib/assessment/version";
import { signIn } from "@/test/auth";
import { createCategory, createTopic, db, resetDb } from "@/test/db";
import { saveTestKeys } from "@/test/keys";
import { afterSettled, resetNextMocks } from "@/test/next";
import { withTempStorage } from "@/test/storage";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);
vi.mock("next/server", async () => (await import("@/test/next")).serverMock);
vi.mock("@anthropic-ai/sdk", async (importOriginal) => (await import("@/test/claude")).anthropicMock(importOriginal));

import { POST } from "./route";

const temp = withTempStorage();

let topicId: string;

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
  topicId = (await createTopic((await createCategory("a")).id, "A topic")).id;
});

afterEach(() => vi.restoreAllMocks());

const deepgramSuccess = {
  metadata: { duration: 2 },
  results: {
    channels: [
      {
        alternatives: [
          {
            transcript: "Hello there.",
            words: [{ word: "hello", punctuated_word: "Hello", start: 0, end: 0.5, confidence: 0.99 }],
          },
        ],
      },
    ],
  },
};

function upload(
  body: BodyInit | null = "video-bytes",
  { contentType = "video/webm", query }: { contentType?: string | null; query?: Record<string, string> } = {},
) {
  const params = new URLSearchParams({ topicId, durationSeconds: "42", ...query });
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  return POST(new Request(`http://localhost/api/recordings?${params}`, { method: "POST", headers, body }));
}

const filesStored = async () => {
  try {
    return (await readdir(temp.root, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  } catch {
    return [];
  }
};

describe("POST /api/recordings", () => {
  it("requires sign-in", async () => {
    const res = await upload();
    expect(res.status).toBe(401);
    expect(await filesStored()).toHaveLength(0);
  });

  describe("when signed in", () => {
    it("stores the file under the user's prefix and records its metadata", async () => {
      const user = await signIn();

      const res = await upload("video-bytes");

      expect(res.status).toBe(201);
      const { id } = await res.json();
      const [row] = await db.select().from(recordings);
      expect(row).toMatchObject({
        id,
        userId: user.id,
        topicId,
        mimeType: "video/webm",
        sizeBytes: "video-bytes".length,
        durationSeconds: 42,
        storageKey: `${user.id}/${id}.webm`,
      });
      expect(row).not.toHaveProperty("prepSeconds");
      expect(await readFile(path.join(temp.root, row.storageKey), "utf8")).toBe("video-bytes");
    });

    it("strips codec parameters from the MIME type and normalises its case", async () => {
      await signIn();
      const res = await upload("x", { contentType: "Video/WebM;codecs=vp9,opus" });

      expect(res.status).toBe(201);
      expect((await db.select().from(recordings))[0].mimeType).toBe("video/webm");
    });

    it.each([
      ["video/mp4", "mp4"],
      ["video/x-matroska", "mkv"],
      ["video/quicktime", "bin"],
      ["audio/webm", "webm"],
      ["audio/mp4", "m4a"],
      ["audio/ogg", "bin"],
    ])("uses the %s extension .%s", async (contentType, extension) => {
      await signIn();
      await upload("x", { contentType });
      expect((await db.select().from(recordings))[0].storageKey).toMatch(new RegExp(`\\.${extension}$`));
    });

    it("accepts a zero duration", async () => {
      await signIn();
      const res = await upload("x", { query: { durationSeconds: "0" } });
      expect(res.status).toBe(201);
    });

    it.each([
      ["a missing topicId", { topicId: "" }],
      ["a non-uuid topicId", { topicId: "nope" }],
      ["a negative duration", { durationSeconds: "-1" }],
      ["a fractional duration", { durationSeconds: "1.5" }],
    ])("rejects %s", async (_name, query) => {
      await signIn();
      const res = await upload("x", { query });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid recording details" });
      expect(await filesStored()).toHaveLength(0);
    });

    it("stores an audio-only recording with its audio MIME type", async () => {
      await signIn();
      const res = await upload("audio-bytes", { contentType: "audio/webm;codecs=opus" });

      expect(res.status).toBe(201);
      expect((await db.select().from(recordings))[0].mimeType).toBe("audio/webm");
    });

    it.each(["image/png", "application/octet-stream", "text/plain", null])(
      "rejects content type %s, which is neither audio nor video",
      async (contentType) => {
        await signIn();
        const res = await upload("x", { contentType });
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ error: "Recordings must be audio or video" });
        expect(await db.select().from(recordings)).toHaveLength(0);
      },
    );

    it("rejects a request with no body", async () => {
      await signIn();
      const res = await upload(null);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Empty upload" });
    });

    it("rejects an empty body and leaves no file behind", async () => {
      await signIn();
      const res = await upload("");
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Empty upload" });
      expect(await filesStored()).toHaveLength(0);
      expect(await db.select().from(recordings)).toHaveLength(0);
    });

    it("rejects an unknown topic before storing anything", async () => {
      await signIn();
      const res = await upload("x", { query: { topicId: "00000000-0000-4000-8000-000000000000" } });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Unknown topic" });
      expect(await filesStored()).toHaveLength(0);
    });

    it("removes the stored file if saving the row fails", async () => {
      await signIn();
      vi.spyOn(db, "insert").mockImplementationOnce(() => {
        throw new Error("db down");
      });

      await expect(upload("x")).rejects.toThrow("db down");
      expect(await filesStored()).toHaveLength(0);
    });

    it("gives each upload its own id and file", async () => {
      await signIn();
      const a = (await (await upload("one")).json()).id;
      const b = (await (await upload("two")).json()).id;
      expect(a).not.toBe(b);
      expect(await filesStored()).toHaveLength(2);
    });

    describe("assessment", () => {
      it("starts an assessment and transcribes the recording when the speaker has both keys", async () => {
        const user = await signIn();
        await saveTestKeys(user.id);
        const fetch = vi.fn().mockResolvedValue(Response.json(deepgramSuccess));
        vi.stubGlobal("fetch", fetch);

        const res = await upload("video-bytes");
        expect(res.status).toBe(201);
        await afterSettled();

        const { id } = await res.json();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(await db.select().from(assessments)).toMatchObject([{ recordingId: id, status: "done", scoringVersion: SCORING_VERSION }]);
        expect(await db.select().from(transcripts)).toMatchObject([{ recordingId: id, text: "Hello there." }]);
      });

      it("saves the recording without an assessment when the speaker has no keys", async () => {
        await signIn();
        const fetch = vi.fn();
        vi.stubGlobal("fetch", fetch);

        const res = await upload("video-bytes");
        await afterSettled();

        expect(res.status).toBe(201);
        expect(await db.select().from(recordings)).toHaveLength(1);
        expect(await db.select().from(assessments)).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
      });

      it("saves the recording without an assessment when only one key is saved", async () => {
        const user = await signIn();
        await saveTestKeys(user.id, { deepgram: "dg-only" });

        const res = await upload("video-bytes");
        await afterSettled();

        expect(res.status).toBe(201);
        expect(await db.select().from(assessments)).toHaveLength(0);
      });
    });
  });
});
