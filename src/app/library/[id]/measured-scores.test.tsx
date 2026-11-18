// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Measurement } from "@/lib/assessment/measure";
import { MeasuredScores } from "./measured-scores";

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

describe("MeasuredScores", () => {
  it("shows each measured dimension's score out of its maximum", () => {
    render(<MeasuredScores scores={{ pace: 89, fillerRate: 120, pronunciation: 133 }} measured={measured} />);

    expect(card("Pace")).toHaveTextContent("89/100");
    expect(card("Filler rate")).toHaveTextContent("120/150");
    expect(card("Pronunciation")).toHaveTextContent("133/150");
  });

  it("shows each dimension's key numbers", () => {
    render(<MeasuredScores scores={measured.scores} measured={measured} />);

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
    render(<MeasuredScores scores={measured.scores} measured={noBaseline} />);

    expect(within(card("Pace")).getByText("Not enough fluent speech")).toBeInTheDocument();
  });
});
