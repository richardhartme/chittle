import { assessments, type AssessmentStatus } from "@/db/schema";
import type { AssessmentResult } from "@/lib/assessment/result";
import { createRecording, db } from "@/test/db";
import { judgementFixture } from "@/test/judgement";

/**
 * A recording with an assessment, done by default with fixed dimension scores (Structure 200,
 * Conciseness 120, Confidence 80, Pronunciation 100, Filler rate 90, Pace 60) and a total of 650.
 */
export async function createAssessedRecording(
  userId: string,
  topicId: string,
  {
    createdAt,
    status = "done",
    totalScore = 650,
    areasToImprove = ["Open with your point", "Cut the hedges"],
  }: { createdAt?: Date; status?: AssessmentStatus; totalScore?: number | null; areasToImprove?: string[] } = {},
) {
  const recording = await createRecording(userId, topicId, createdAt ? { createdAt } : {});
  const done = status === "done";
  await db.insert(assessments).values({
    recordingId: recording.id,
    status,
    startedAt: createdAt ?? new Date(),
    completedAt: done ? (createdAt ?? new Date()) : null,
    scoringVersion: done ? 3 : null,
    totalScore,
    ...(done && totalScore !== null
      ? {
          structureScore: 200,
          concisenessScore: 120,
          confidenceScore: 80,
          pronunciationScore: 100,
          fillerRateScore: 90,
          paceScore: 60,
        }
      : {}),
    result: done ? ({ judged: { ...judgementFixture(), areasToImprove } } as unknown as AssessmentResult) : null,
  });
  return recording;
}
