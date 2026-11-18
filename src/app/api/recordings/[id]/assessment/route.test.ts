import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessments } from "@/db/schema";
import { signIn } from "@/test/auth";
import { createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";
import { resetNextMocks } from "@/test/next";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));
vi.mock("next/headers", async () => (await import("@/test/next")).headersMock);
vi.mock("next/navigation", async () => (await import("@/test/next")).navigationMock);

import { GET } from "./route";

const get = (id: string) =>
  GET(new Request(`http://localhost/api/recordings/${id}/assessment`), { params: Promise.resolve({ id }) } as never);

let topicId: string;

beforeEach(async () => {
  await resetDb();
  resetNextMocks();
  topicId = (await createTopic((await createCategory()).id)).id;
});

async function assess(
  recordingId: string,
  status: "pending" | "done" | "failed",
  { minutesAgo = 0, error = null }: { minutesAgo?: number; error?: string | null } = {},
) {
  await db.insert(assessments).values({
    recordingId,
    status,
    error,
    startedAt: sql`now() - make_interval(mins => ${minutesAgo})`,
  });
}

describe("GET /api/recordings/[id]/assessment", () => {
  it("requires sign-in", async () => {
    const owner = await createUser();
    const recording = await createRecording(owner.id, topicId);
    expect((await get(recording.id)).status).toBe(401);
  });

  it("reports an unassessed recording as none", async () => {
    const user = await signIn();
    const recording = await createRecording(user.id, topicId);

    const res = await get(recording.id);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "none", error: null });
  });

  it.each([
    ["pending", null],
    ["done", null],
    ["failed", "Deepgram rejected the key."],
  ] as const)("reports a %s assessment", async (status, error) => {
    const user = await signIn();
    const recording = await createRecording(user.id, topicId);
    await assess(recording.id, status, { error });

    expect(await (await get(recording.id)).json()).toEqual({ status, error });
  });

  it("reports a pending assessment started over 5 minutes ago as failed", async () => {
    const user = await signIn();
    const recording = await createRecording(user.id, topicId);
    await assess(recording.id, "pending", { minutesAgo: 6 });

    expect(await (await get(recording.id)).json()).toEqual({
      status: "failed",
      error: "The assessment stopped before it finished.",
    });
  });

  it("returns 404 for another speaker's recording", async () => {
    const owner = await createUser();
    const recording = await createRecording(owner.id, topicId);
    await assess(recording.id, "done");
    await signIn();

    expect((await get(recording.id)).status).toBe(404);
  });

  it.each(["not-a-uuid", "00000000-0000-4000-8000-000000000000"])("returns 404 for %s", async (id) => {
    await signIn();
    expect((await get(id)).status).toBe(404);
  });
});
