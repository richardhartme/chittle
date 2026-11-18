import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessments } from "@/db/schema";
import { createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

import { claimAssessment } from "./claim";

let recordingId: string;

beforeEach(async () => {
  await resetDb();
  const user = await createUser();
  const topic = await createTopic((await createCategory()).id);
  recordingId = (await createRecording(user.id, topic.id)).id;
});

const row = async () => (await db.select().from(assessments).where(eq(assessments.recordingId, recordingId)))[0];

async function setRow(status: "pending" | "done" | "failed", minutesAgo: number, error: string | null = null) {
  await db.insert(assessments).values({
    recordingId,
    status,
    error,
    startedAt: sql`now() - make_interval(mins => ${minutesAgo})`,
  });
}

const startedSecondsAgo = async () => (Date.now() - (await row()).startedAt.getTime()) / 1000;

describe("claimAssessment", () => {
  it("claims a recording with no assessment, marking it pending from now", async () => {
    const claimed = await claimAssessment(recordingId);
    expect(claimed).toEqual((await row()).startedAt);
    expect(await row()).toMatchObject({ status: "pending", error: null, completedAt: null });
    expect(await startedSecondsAgo()).toBeLessThan(5);
  });

  it("refuses while a fresh pending assessment is running", async () => {
    await setRow("pending", 1);
    expect(await claimAssessment(recordingId)).toBeNull();
    expect(await startedSecondsAgo()).toBeGreaterThan(55);
  });

  it("reclaims a pending assessment started more than 5 minutes ago", async () => {
    await setRow("pending", 6);
    expect(await claimAssessment(recordingId)).toBeInstanceOf(Date);
    expect(await startedSecondsAgo()).toBeLessThan(5);
  });

  it("reclaims a failed assessment and clears its error", async () => {
    await setRow("failed", 1, "Deepgram rejected the key.");
    expect(await claimAssessment(recordingId)).toBeInstanceOf(Date);
    expect(await row()).toMatchObject({ status: "pending", error: null });
  });

  it("lets only one of two simultaneous claims through", async () => {
    const results = await Promise.all([claimAssessment(recordingId), claimAssessment(recordingId)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});
