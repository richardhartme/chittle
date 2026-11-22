// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScoreHistoryChart } from "./score-history-chart";

const scores = { structure: 150, conciseness: 120, confidence: 110, pronunciation: 120, fillerRate: 90, pace: 65 };
const column = { recordingId: "rec-1", date: "3 Nov 2026", total: 655, scores };

describe("ScoreHistoryChart", () => {
  it("has a legend entry for each dimension when they're all stacked", () => {
    render(
      <ScoreHistoryChart
        view={{ keys: ["structure", "conciseness", "confidence", "pronunciation", "fillerRate", "pace"], max: 1000, name: "Score" }}
        columns={[{ ...column, value: 655 }]}
      />,
    );

    const legend = screen.getByRole("list", { name: "Dimensions" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
      "Shape",
      "Brevity",
      "Conviction",
      "Clarity",
      "Fluency",
      "Rhythm",
    ]);
  });

  it("has a one-entry legend when a single dimension is selected", () => {
    render(<ScoreHistoryChart view={{ keys: ["pace"], max: 100, name: "Rhythm" }} columns={[{ ...column, value: 65 }]} />);

    const legend = screen.getByRole("list", { name: "Dimensions" });
    expect(within(legend).getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual(["Rhythm"]);
  });
});
