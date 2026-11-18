import { describe, expect, it } from "vitest";
import { compositionSegments } from "./score-composition";

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
