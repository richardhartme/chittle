import { describe, expect, it } from "vitest";
import { judgementFixture, wordsOf } from "@/test/judgement";
import { measure } from "./measure";
import { scoreJudgement } from "./score";

// 20 words, one of them Deepgram's filler "um": 5 fillers per 100 words, which scores 110 on its own.
const words = wordsOf("Um, I think the plan is sort of good, you know, and I think we should ship it right now.");
const durationSeconds = 30;
const measured = {
  ...measure(words, durationSeconds),
  scores: { pace: 80, fillerRate: 110, pronunciation: 133 },
  subScores: { pauseTiming: 45, wordsPerMinute: 35 },
};

const score = (judgement = judgementFixture()) => scoreJudgement({ judgement, measured, words, durationSeconds });

describe("scoreJudgement", () => {
  it("rounds judged scores and clamps them to their sub-score's range", () => {
    const judgement = judgementFixture();
    judgement.structure.logicalSequence.score = 80; // max 50
    judgement.structure.transitions.score = -5;
    judgement.structure.signposting.score = 33.6;
    judgement.conciseness.wordEconomy.score = 100; // max 70
    judgement.confidence.assertiveness.score = Number.NaN;

    const { judged, scores } = score(judgement);

    expect(judged.dimensions.structure.subScores).toMatchObject({
      logicalSequence: { score: 50 },
      transitions: { score: 0 },
      signposting: { score: 34 },
      openingQuality: { score: 40 },
    });
    expect(judged.dimensions.conciseness.subScores.wordEconomy.score).toBe(70);
    expect(judged.dimensions.confidence.subScores.assertiveness.score).toBe(0);
    expect(scores).toMatchObject({ structure: 164, conciseness: 150, confidence: 40 });
  });

  it("caps hedge counts at the times each phrase actually occurs, dropping phrases that never do", () => {
    const { judged } = score(
      judgementFixture({
        hedges: [
          { phrase: "I think", count: 5 },
          { phrase: "Sort of", count: 1 },
          { phrase: "probably", count: 2 },
        ],
      }),
    );

    expect(judged.hedges).toEqual({
      total: 3,
      perMinute: 6,
      breakdown: [
        { phrase: "i think", count: 2 },
        { phrase: "sort of", count: 1 },
      ],
    });
  });

  it("adds the discourse fillers actually in the transcript to the filler count and rescores Filler rate", () => {
    const { judged, scores } = score(
      judgementFixture({
        discourseFillers: [
          { phrase: "you know", count: 3 },
          { phrase: "like", count: 2 }, // never said
          { phrase: "um", count: 1 }, // already counted by Deepgram
        ],
      }),
    );

    expect(judged.fillers).toEqual({
      total: 2,
      perMinute: 4,
      per100Words: 10,
      breakdown: [
        { word: "um", count: 1 },
        { word: "you know", count: 1 },
      ],
    });
    expect(scores.fillerRate).toBe(70);
    expect(judged.dimensions.fillerRate.subScores.fillerFrequency.score).toBe(70);
  });

  it("takes the measured scores for Pronunciation and Pace, and sums every dimension into the total", () => {
    const judgement = judgementFixture();
    judgement.structure.closingQuality.score = 45;
    judgement.conciseness.sentenceLength.score = 30;

    const { scores, total, judged } = score(judgement);

    // Structure 40×4 + 45, Conciseness 40 + 40 + 30, Confidence 40 + 40, then the measured 133, 110 and 80.
    expect(scores).toEqual({
      structure: 205,
      conciseness: 110,
      confidence: 80,
      pronunciation: 133,
      fillerRate: 110,
      pace: 80,
    });
    expect(total).toBe(718);
    expect(judged.dimensions.pace.subScores).toEqual({
      pauseTiming: { score: 45, feedback: "Measured feedback." },
      wordsPerMinute: { score: 35, feedback: "Measured feedback." },
    });
  });

  it("keeps the feedback text, with at most 3 strengths and 4 areas to improve", () => {
    const { judged } = score(
      judgementFixture({
        strengths: ["One", "Two", "Three", "Four"],
        areasToImprove: ["A", "B", "C", "D", "E"],
        redundantPhrases: ["right now"],
      }),
    );

    expect(judged).toMatchObject({
      overview: "A clear answer that could open more strongly.",
      strengths: ["One", "Two", "Three"],
      areasToImprove: ["A", "B", "C", "D"],
      redundantPhrases: ["right now"],
    });
    expect(judged.dimensions.structure.summary).toBe("Structure summary.");
  });
});
