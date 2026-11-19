// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { compositionSegments, ScoreComposition } from "./score-composition";

describe("compositionSegments", () => {
  it("gives each dimension a width proportional to its share of the 1000, in display order", () => {
    const segments = compositionSegments({
      structure: 200,
      conciseness: 150,
      confidence: 100,
      pronunciation: 125,
      fillerRate: 75,
      pace: 50,
    });

    expect(segments.map(({ key, width }) => [key, width])).toEqual([
      ["structure", 20],
      ["conciseness", 15],
      ["confidence", 10],
      ["pronunciation", 12.5],
      ["fillerRate", 7.5],
      ["pace", 5],
    ]);
  });

  it("fills the whole bar at full marks", () => {
    const segments = compositionSegments({
      structure: 250,
      conciseness: 200,
      confidence: 150,
      pronunciation: 150,
      fillerRate: 150,
      pace: 100,
    });

    expect(segments.reduce((sum, s) => sum + s.width, 0)).toBe(100);
  });
});

describe("ScoreComposition", () => {
  const scores = { structure: 200, conciseness: 150, confidence: 110, pronunciation: 125, fillerRate: 90, pace: 61 };
  const previousId = "6f1c2a4e-8b1d-4c3a-9e2f-1a2b3c4d5e6f";

  it("shows the change since the previous attempt, linking to it", () => {
    render(<ScoreComposition total={736} scores={scores} previous={{ recordingId: previousId, total: 655 }} />);

    expect(screen.getByText(/^Previous attempt/).closest("p")).toHaveTextContent("Previous attempt: 655 → 736 (+81)");
    expect(screen.getByRole("link", { name: "Previous attempt" })).toHaveAttribute("href", `/library/${previousId}`);
  });

  it.each([
    [600, "(−55)"],
    [655, "(±0)"],
  ])("writes a change to %i with its sign as %s", (total, change) => {
    render(<ScoreComposition total={total} scores={scores} previous={{ recordingId: previousId, total: 655 }} />);

    expect(screen.getByText(/^Previous attempt/).closest("p")).toHaveTextContent(`655 → ${total} ${change}`);
  });

  it("shows no comparison for a first attempt", () => {
    render(<ScoreComposition total={736} scores={scores} />);

    expect(screen.queryByText(/Previous attempt/)).not.toBeInTheDocument();
  });
});
