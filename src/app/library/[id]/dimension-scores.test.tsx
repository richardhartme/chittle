// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Measurement } from "@/lib/assessment/measure";
import { scoreJudgement } from "@/lib/assessment/score";
import { judgementFixture, wordsOf } from "@/test/judgement";
import { DimensionScores } from "./dimension-scores";

const measured: Measurement = {
  fillers: {
    total: 5,
    perMinute: 2.46,
    per100Words: 1.42,
    breakdown: [
      { word: "um", count: 3 },
      { word: "uh", count: 2 },
    ],
  },
  pronunciation: { clarity: 0.957, flagged: [{ word: "quixotic", start: 3, end: 3.4, confidence: 0.4 }] },
  pace: {
    overallWpm: 141.6,
    activeWpm: 172.3,
    overallBand: "Ideal",
    activeBand: "Slow",
    segments: [],
    baselineWpm: 181.2,
    baselineRange: [164.4, 199.8],
    baselineBand: "Ideal",
    rushThreshold: 246.4,
    dragThreshold: 116,
    rushZones: [],
    dragZones: [],
    hesitationZones: [{ start: 10, end: 11.5, seconds: 1.5 }],
    overTime: { windows: [], average: 170, standardDeviation: 20, range: [130, 210] },
  },
  sentences: { words: 350, sentences: 20, averageLength: 17.5, averageBand: "Ideal", longSentences: 1 },
  scores: { pace: 89, fillerRate: 139, pronunciation: 133 },
  subScores: { pauseTiming: 50, wordsPerMinute: 39 },
};

const card = (name: string) => screen.getByRole("heading", { name }).closest("li")!;

/** Scores as an assessment from scoring version 1 stored them: measured only. */
const measuredOnly = { structure: null, conciseness: null, confidence: null, pace: 89, fillerRate: 120, pronunciation: 133 };

const { judged } = scoreJudgement({
  judgement: judgementFixture({ discourseFillers: [{ phrase: "you know", count: 2 }] }),
  measured,
  words: wordsOf("Um, you know, I think, you know, it went well."),
  durationSeconds: 60,
});
const allScores = { structure: 205, conciseness: 150, confidence: 95, pronunciation: 133, fillerRate: 110, pace: 89 };

describe("DimensionScores", () => {
  it("shows all six dimensions' scores out of their maximums, with each summary", () => {
    render(<DimensionScores scores={allScores} measured={measured} judged={judged} />);

    expect(card("Structure")).toHaveTextContent("205/250");
    expect(card("Conciseness")).toHaveTextContent("150/200");
    expect(card("Confidence")).toHaveTextContent("95/150");
    expect(card("Pronunciation")).toHaveTextContent("133/150");
    expect(card("Filler rate")).toHaveTextContent("110/150");
    expect(card("Pace")).toHaveTextContent("89/100");
    expect(card("Structure")).toHaveTextContent("Structure summary.");
    expect(card("Pace")).toHaveTextContent("Pace summary.");
  });

  it("counts the discourse fillers in the Filler rate numbers", () => {
    render(<DimensionScores scores={allScores} measured={measured} judged={judged} />);

    const filler = within(card("Filler rate"));
    expect(filler.getByText("Fillers").nextSibling).toHaveTextContent(/^7$/); // 5 measured + 2 "you know"
    expect(filler.getByText("“um” ×3, “uh” ×2, “you know” ×2")).toBeInTheDocument();
  });

  it("shows only the measured dimensions for an assessment from before judging", () => {
    render(<DimensionScores scores={measuredOnly} measured={measured} />);

    expect(screen.queryByRole("heading", { name: "Structure" })).not.toBeInTheDocument();
    expect(card("Pace")).toHaveTextContent("89/100");
    expect(card("Filler rate")).toHaveTextContent("120/150");
    expect(card("Pronunciation")).toHaveTextContent("133/150");
  });

  it("shows each measured dimension's key numbers", () => {
    render(<DimensionScores scores={measuredOnly} measured={measured} />);

    const pace = within(card("Pace"));
    expect(pace.getByText("172 · Slow")).toBeInTheDocument();
    expect(pace.getByText("142 · Ideal")).toBeInTheDocument();
    expect(pace.getByText("181 (164–200)")).toBeInTheDocument();
    const filler = within(card("Filler rate"));
    expect(filler.getByText("2.5")).toBeInTheDocument();
    expect(filler.getByText("“um” ×3, “uh” ×2")).toBeInTheDocument();
    const pronunciation = within(card("Pronunciation"));
    expect(pronunciation.getByText("96%")).toBeInTheDocument();
    expect(pronunciation.getByText("1")).toBeInTheDocument();
  });

  it("says when there wasn't enough fluent speech for a baseline", () => {
    const noBaseline = { ...measured, pace: { ...measured.pace, baselineWpm: null, baselineRange: null } };
    render(<DimensionScores scores={measuredOnly} measured={noBaseline} />);

    expect(within(card("Pace")).getByText("Not enough fluent speech")).toBeInTheDocument();
  });
});
