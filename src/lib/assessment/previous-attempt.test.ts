import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessments, type Recording } from "@/db/schema";
import { createCategory, createRecording, createTopic, createUser, db, resetDb } from "@/test/db";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

import { previousAttempt } from "./previous-attempt";

beforeEach(resetDb);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const scores = { structure: 150, conciseness: 120, confidence: 110, pronunciation: 120, fillerRate: 90, pace: 65 };

/** Gives a recording an assessment. A done one has the given total and the dimension scores above. */
async function assess(recording: Recording, total: number, status: "done" | "pending" | "failed" = "done") {
  await db.insert(assessments).values({
    recordingId: recording.id,
    status,
    startedAt: recording.createdAt,
    ...(status === "done" && {
      completedAt: recording.createdAt,
      scoringVersion: 3,
      totalScore: total,
      structureScore: scores.structure,
      concisenessScore: scores.conciseness,
      confidenceScore: scores.confidence,
      pronunciationScore: scores.pronunciation,
      fillerRateScore: scores.fillerRate,
      paceScore: scores.pace,
    }),
  });
}

async function setup() {
  const user = await createUser();
  const category = await createCategory();
  const topic = await createTopic(category.id);
  const current = await createRecording(user.id, topic.id, { createdAt: minutesAgo(0) });
  return { user, category, topic, current };
}

describe("previousAttempt", () => {
  it("returns the most recent earlier assessed recording of the same topic, with its scores", async () => {
    const { user, topic, current } = await setup();
    const oldest = await createRecording(user.id, topic.id, { createdAt: minutesAgo(30) });
    const latest = await createRecording(user.id, topic.id, { createdAt: minutesAgo(10) });
    await assess(oldest, 500);
    await assess(latest, 655);

    expect(await previousAttempt(current)).toEqual({ recordingId: latest.id, total: 655, scores });
  });

  it("returns null when the topic hasn't been recorded before", async () => {
    const { current } = await setup();
    await assess(current, 700);

    expect(await previousAttempt(current)).toBeNull();
  });

  it("ignores later recordings of the topic", async () => {
    const { user, topic } = await setup();
    const earlier = await createRecording(user.id, topic.id, { createdAt: minutesAgo(20) });
    const later = await createRecording(user.id, topic.id, { createdAt: minutesAgo(5) });
    await assess(later, 800);

    expect(await previousAttempt(earlier)).toBeNull();
  });

  it("ignores recordings of other topics", async () => {
    const { user, category, current } = await setup();
    const other = await createTopic(category.id);
    await assess(await createRecording(user.id, other.id, { createdAt: minutesAgo(10) }), 600);

    expect(await previousAttempt(current)).toBeNull();
  });

  it("ignores other users' recordings of the topic", async () => {
    const { topic, current } = await setup();
    const someoneElse = await createUser();
    await assess(await createRecording(someoneElse.id, topic.id, { createdAt: minutesAgo(10) }), 600);

    expect(await previousAttempt(current)).toBeNull();
  });

  it("skips earlier recordings that aren't assessed", async () => {
    const { user, topic, current } = await setup();
    const assessed = await createRecording(user.id, topic.id, { createdAt: minutesAgo(40) });
    await assess(assessed, 610);
    await createRecording(user.id, topic.id, { createdAt: minutesAgo(30) });
    await assess(await createRecording(user.id, topic.id, { createdAt: minutesAgo(20) }), 0, "pending");
    await assess(await createRecording(user.id, topic.id, { createdAt: minutesAgo(10) }), 0, "failed");

    expect(await previousAttempt(current)).toMatchObject({ recordingId: assessed.id, total: 610 });
  });

  it("skips assessments from before judging, which have no score", async () => {
    const { user, topic, current } = await setup();
    const measuredOnly = await createRecording(user.id, topic.id, { createdAt: minutesAgo(10) });
    await db.insert(assessments).values({
      recordingId: measuredOnly.id,
      status: "done",
      startedAt: measuredOnly.createdAt,
      completedAt: measuredOnly.createdAt,
      scoringVersion: 1,
      pronunciationScore: 120,
      fillerRateScore: 90,
      paceScore: 65,
    });

    expect(await previousAttempt(current)).toBeNull();
  });
});
