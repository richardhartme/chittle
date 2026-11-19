import { beforeEach, describe, expect, it, vi } from "vitest";
import { focusVotes } from "@/db/schema";
import { createCategory, createTopic, createUser, db, resetDb } from "@/test/db";
import { createAssessedRecording } from "@/test/progress-insight";

vi.mock("@/db", async () => ({ db: (await import("@/test/db")).db }));

import { insightContext } from "./context";

let userId: string;
let interviewTopic: string;
let storyTopic: string;

beforeEach(async () => {
  await resetDb();
  userId = (await createUser()).id;
  interviewTopic = (await createTopic((await createCategory("interview", "Interview", "star")).id)).id;
  storyTopic = (await createTopic((await createCategory("storytelling", "Storytelling", "story_arc")).id)).id;
});

const day = (d: number) => new Date(Date.UTC(2026, 10, d, 9));

describe("insightContext", () => {
  it("gives the speaker's last 10 assessments by date, oldest first, with their category, framework and scores", async () => {
    // 12 assessments on 1–12 November, created out of order: the first two are too old to send.
    for (const d of [5, 1, 12, 3, 7, 2, 9, 11, 4, 6, 10, 8]) {
      await createAssessedRecording(userId, d % 2 ? storyTopic : interviewTopic, {
        createdAt: day(d),
        totalScore: 500 + d,
      });
    }

    const { assessments } = await insightContext(userId);

    expect(assessments.map((a) => a.date)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(day));
    expect(assessments.map((a) => a.total)).toEqual([503, 504, 505, 506, 507, 508, 509, 510, 511, 512]);
    expect(assessments[0]).toMatchObject({ category: "Storytelling", framework: "story_arc" });
    expect(assessments[1]).toMatchObject({ category: "Interview", framework: "star" });
    expect(assessments[0].scores).toEqual({
      structure: 200,
      conciseness: 120,
      confidence: 80,
      pronunciation: 100,
      fillerRate: 90,
      pace: 60,
    });
  });

  it("includes each assessment's top three areas to improve", async () => {
    await createAssessedRecording(userId, interviewTopic, {
      areasToImprove: ["Open with your point", "Cut the hedges", "Slow down", "Land the ending"],
    });

    const { assessments } = await insightContext(userId);

    expect(assessments[0].areasToImprove).toEqual(["Open with your point", "Cut the hedges", "Slow down"]);
  });

  it("leaves out other speakers' assessments and ones that aren't done or have no total", async () => {
    await createAssessedRecording(userId, interviewTopic, { totalScore: 640 });
    await createAssessedRecording(userId, interviewTopic, { status: "failed", totalScore: null });
    await createAssessedRecording(userId, interviewTopic, { status: "pending", totalScore: null });
    await createAssessedRecording(userId, interviewTopic, { totalScore: null }); // scoring version 1
    await createAssessedRecording((await createUser()).id, interviewTopic, { totalScore: 900 });

    const { assessments } = await insightContext(userId);

    expect(assessments.map((a) => a.total)).toEqual([640]);
  });

  it("gives the speaker's recent focus votes, newest first, and nobody else's", async () => {
    const recording = await createAssessedRecording(userId, interviewTopic);
    await db.insert(focusVotes).values([
      { userId, recordingId: recording.id, area: "Cut the hedges", vote: "up", createdAt: day(1) },
      { userId, recordingId: recording.id, area: "Slow down", vote: "down", createdAt: day(2) },
    ]);
    const other = await createUser();
    await db.insert(focusVotes).values({
      userId: other.id,
      recordingId: (await createAssessedRecording(other.id, interviewTopic)).id,
      area: "Someone else's area",
      vote: "up",
    });

    const { focusVotes: votes } = await insightContext(userId);

    expect(votes).toEqual([
      { area: "Slow down", vote: "down" },
      { area: "Cut the hedges", vote: "up" },
    ]);
  });
});
