import { rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signIn } from "@/test/auth";
import { createCategory, createRecording, createTopic, createUser, resetDb } from "@/test/db";
import { resetNextMocks } from "@/test/next";
import { streamOf, withTempStorage } from "@/test/storage";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);

import { GET } from "./route";

const temp = withTempStorage();

const get = (id: string, range?: string) =>
  GET(
    new Request(`http://localhost/api/recordings/${id}/file`, { headers: range ? { Range: range } : {} }),
    { params: Promise.resolve({ id }) } as never,
  );

let topicId: string;

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
  topicId = (await createTopic((await createCategory("a")).id, "A topic")).id;
});

/** Creates a 10-byte recording ("0123456789") owned by `userId`, with its file on disk. */
async function seedRecording(userId: string, mimeType = "video/webm") {
  const recording = await createRecording(userId, topicId, { mimeType, sizeBytes: 10 });
  await temp.storage().put(recording.storageKey, streamOf("0123456789"));
  return recording;
}

describe("GET /api/recordings/[id]/file", () => {
  it("requires sign-in", async () => {
    const owner = await createUser();
    const recording = await seedRecording(owner.id);
    expect((await get(recording.id)).status).toBe(401);
  });

  describe("when signed in", () => {
    it("streams the whole file with its content type", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id, "video/mp4");

      const res = await get(recording.id);

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("video/mp4");
      expect(res.headers.get("Content-Length")).toBe("10");
      expect(res.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(res.headers.get("Content-Range")).toBeNull();
      expect(await res.text()).toBe("0123456789");
    });

    it("serves a bounded range as 206", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id);

      const res = await get(recording.id, "bytes=2-5");

      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
      expect(res.headers.get("Content-Length")).toBe("4");
      expect(await res.text()).toBe("2345");
    });

    it("serves an open-ended range to the end of the file", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id);

      const res = await get(recording.id, "bytes=7-");

      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 7-9/10");
      expect(await res.text()).toBe("789");
    });

    it("clamps a range that runs past the end", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id);

      const res = await get(recording.id, "bytes=8-999");

      expect(res.status).toBe(206);
      expect(res.headers.get("Content-Range")).toBe("bytes 8-9/10");
      expect(await res.text()).toBe("89");
    });

    it("answers 416 for a range outside the file", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id);

      const res = await get(recording.id, "bytes=50-60");

      expect(res.status).toBe(416);
      expect(res.headers.get("Content-Range")).toBe("bytes */10");
    });

    it("answers 416 for a reversed range", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id);
      expect((await get(recording.id, "bytes=5-2")).status).toBe(416);
    });

    it.each(["bytes=-5", "items=0-5", "bytes=0-1,3-4", "garbage"])(
      "ignores unsupported range header %j and serves the whole file",
      async (range) => {
        const user = await signIn();
        const recording = await seedRecording(user.id);

        const res = await get(recording.id, range);

        expect(res.status).toBe(200);
        expect(await res.text()).toBe("0123456789");
      },
    );

    it("returns 404 for a malformed id", async () => {
      await signIn();
      expect((await get("not-a-uuid")).status).toBe(404);
    });

    it("returns 404 for an unknown recording", async () => {
      await signIn();
      expect((await get("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    });

    it("returns 404 for another user's recording, same as a missing one", async () => {
      const owner = await createUser();
      const recording = await seedRecording(owner.id);
      await signIn();

      const res = await get(recording.id);

      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Not found");
    });

    it("returns 404 if the file has gone missing from storage", async () => {
      const user = await signIn();
      const recording = await seedRecording(user.id);
      await rm(path.join(temp.root, recording.storageKey));

      expect((await get(recording.id)).status).toBe(404);
    });
  });
});
