// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Measurement } from "@/lib/assessment/measure";
import { scoreJudgement } from "@/lib/assessment/score";
import { judgementFixture, wordsOf } from "@/test/judgement";

import { DimensionCards } from "./dimension-cards";

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
    segments: [
      { start: 0.5, end: 6.2, words: 17, wpm: 178.9 },
      { start: 7, end: 12.4, words: 16, wpm: 177.8 },
      { start: 13.1, end: 15.1, words: 9, wpm: 270 },
      { start: 16.6, end: 20.5, words: 12, wpm: 184.6 },
    ],
    baselineWpm: 181.2,
    baselineRange: [164.4, 199.8],
    baselineBand: "Ideal",
    rushThreshold: 246.4,
    dragThreshold: 116,
    rushZones: [{ start: 13.1, end: 15.1, words: 9, wpm: 270 }],
    dragZones: [],
    hesitationZones: [{ start: 10, end: 11.5, seconds: 1.5 }],
    overTime: {
      windows: [
        { start: 0.5, end: 7.2, wpm: 130.2 },
        { start: 7.2, end: 13.9, wpm: 179.1 },
        { start: 13.9, end: 20.5, wpm: 210.7 },
      ],
      average: 170.4, standardDeviation: 20.26, range: [130.2, 210.7] },
  },
  sentences: { words: 350, sentences: 20, averageLength: 17.5, averageBand: "Ideal", longSentences: 1 },
  scores: { pace: 89, fillerRate: 139, pronunciation: 133 },
  subScores: { pauseTiming: 50, wordsPerMinute: 39 },
};

const { judged } = scoreJudgement({
  judgement: judgementFixture({
    structure: {
      summary: "Shape summary.",
      logicalSequence: { score: 45, feedback: "Your points built nicely." },
      transitions: { score: 30, feedback: "Link the second point to the first." },
      signposting: { score: 40, feedback: "Feedback." },
      openingQuality: { score: 50, feedback: "Feedback." },
      closingQuality: { score: 40, feedback: "Feedback." },
    },
    hedges: [{ phrase: "I think", count: 2 }],
    discourseFillers: [{ phrase: "you know", count: 2 }],
    redundantPhrases: ["at this moment in time"],
  }),
  measured,
  words: wordsOf("Um, you know, I think, you know, it went well. I think at this moment in time it did."),
  durationSeconds: 60,
});
const scores = { structure: 205, conciseness: 120, confidence: 80, pronunciation: 133, fillerRate: 110, pace: 89 };

const renderCards = () => render(<DimensionCards scores={scores} measured={measured} judged={judged} durationSeconds={65} />);
const card = (name: RegExp) => screen.getByRole("button", { name });
const drawer = () => screen.getByRole("dialog");
/** A statistic's value in the open drawer, by its label. */
const stat = (label: string) => within(drawer()).getByText(label, { selector: "dt" }).nextElementSibling;

describe("DimensionCards", () => {
  it("shows a card for each dimension with its score out of the maximum", () => {
    renderCards();

    expect(card(/^Shape/)).toHaveTextContent("205/250");
    expect(card(/^Brevity/)).toHaveTextContent("120/200");
    expect(card(/^Conviction/)).toHaveTextContent("80/150");
    expect(card(/^Clarity/)).toHaveTextContent("133/150");
    expect(card(/^Fluency/)).toHaveTextContent("110/150");
    expect(card(/^Rhythm/)).toHaveTextContent("89/100");
  });

  it("groups the judged dimensions under What you said and the measured ones under How you said it", () => {
    renderCards();

    const names = (group: string) =>
      within(screen.getByRole("region", { name: group }))
        .getAllByRole("button")
        .map((button) => button.querySelector(".dimension-card-name")?.textContent);
    expect(names("What you said")).toEqual(["Shape", "Brevity", "Conviction"]);
    expect(names("How you said it")).toEqual(["Clarity", "Fluency", "Rhythm"]);
  });

  it("shows each dimension's change since the previous attempt", () => {
    const previousScores = { ...scores, structure: 190, confidence: 92, pace: null };
    render(
      <DimensionCards
        scores={scores}
        previousScores={previousScores}
        measured={measured}
        judged={judged}
        durationSeconds={65}
      />,
    );

    expect(card(/^Shape/)).toHaveAccessibleName(/205\/250 \+15 since your previous attempt$/);
    expect(card(/^Conviction/)).toHaveAccessibleName(/80\/150 −12 since your previous attempt$/);
    expect(card(/^Brevity/)).toHaveAccessibleName(/120\/200 ±0 since your previous attempt$/);
    // The previous attempt had no Rhythm score to compare with.
    expect(card(/^Rhythm/)).not.toHaveAccessibleName(/previous attempt/);
  });

  it("shows no changes for a first attempt", () => {
    renderCards();

    for (const button of screen.getAllByRole("button", { name: /\d\/\d/ })) {
      expect(button).not.toHaveAccessibleName(/previous attempt/);
    }
  });

  it("opens a drawer from a card with that dimension's summary and sub-scores", async () => {
    renderCards();

    await userEvent.click(card(/^Shape/));

    expect(screen.getByRole("dialog", { name: "Shape" })).toHaveTextContent(/^Shape.*205\/250/);
    const open = within(drawer());
    expect(open.getByText("Shape summary.")).toBeInTheDocument();
    const subScores = within(open.getByRole("list", { name: "Scoring breakdown" })).getAllByRole("listitem");
    expect(subScores.map((li) => within(li).getByRole("heading").textContent)).toEqual([
      "Logical sequence",
      "Transitions",
      "Signposting",
      "Opening quality",
      "Closing quality",
    ]);
    expect(subScores[1]).toHaveTextContent("30/50");
  });

  it("shows and hides each sub-score's feedback", async () => {
    renderCards();
    await userEvent.click(card(/^Shape/));
    const transitions = within(drawer()).getAllByRole("listitem")[1];
    const toggle = within(transitions).getByRole("button", { name: "View feedback" });
    expect(within(transitions).queryByText("Link the second point to the first.")).not.toBeVisible();

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(transitions).getByText("Link the second point to the first.")).toBeVisible();
    expect(within(drawer()).getByText("Your points built nicely.")).not.toBeVisible();

    await userEvent.click(within(transitions).getByRole("button", { name: "Hide feedback" }));

    expect(within(transitions).getByText("Link the second point to the first.")).not.toBeVisible();
  });

  it("closes on Esc and returns focus to the card that opened it", async () => {
    renderCards();
    await userEvent.click(card(/^Conviction/));
    expect(screen.getByRole("dialog", { name: "Conviction" })).toBeVisible();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(card(/^Conviction/)).toHaveFocus();
  });

  it("closes from the close button and from a click on the backdrop", async () => {
    renderCards();
    await userEvent.click(card(/^Rhythm/));
    await userEvent.click(within(drawer()).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(card(/^Rhythm/)).toHaveFocus();

    await userEvent.click(card(/^Rhythm/));
    await userEvent.click(drawer()); // The dialog element itself is the backdrop: its contents are inside.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reopens the same drawer when its card is clicked again straight after Esc", async () => {
    renderCards();
    await userEvent.click(card(/^Rhythm/));

    // Both before the browser fires the first close's `close` event.
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(card(/^Rhythm/));
    });

    await act(() => new Promise((resolve) => setTimeout(resolve)));
    expect(screen.getByRole("dialog", { name: "Rhythm" })).toBeVisible();
  });

  it("opens a different dimension's drawer after one is closed", async () => {
    renderCards();
    await userEvent.click(card(/^Rhythm/));
    await userEvent.keyboard("{Escape}");

    await userEvent.click(card(/^Clarity/));

    expect(screen.getByRole("dialog", { name: "Clarity" })).toBeVisible();
  });

  it("shows Brevity's sentence statistics, redundant phrases and sentence-length band", async () => {
    renderCards();
    await userEvent.click(card(/^Brevity/));

    expect(stat("Words")).toHaveTextContent(/^350$/);
    expect(stat("Sentences")).toHaveTextContent(/^20$/);
    expect(stat("Average length")).toHaveTextContent(/^17.5 words$/);
    expect(stat("Long sentences")).toHaveTextContent(/^1$/);
    expect(stat("Redundant phrases")).toHaveTextContent(/^1$/);
    expect(within(drawer()).getByText("“at this moment in time”")).toBeInTheDocument();
    expect(
      within(drawer()).getByRole("img", { name: "Average sentence length: 17.5 words, in the Ideal band of 20 or fewer" }),
    ).toBeInTheDocument();
  });

  it("shows Conviction's hedge counts, with a bar for each hedge phrase", async () => {
    renderCards();
    await userEvent.click(card(/^Conviction/));

    expect(stat("Hedges")).toHaveTextContent(/^2$/);
    expect(stat("Per minute")).toHaveTextContent(/^2$/);
    expect(stat("Duration")).toHaveTextContent(/^1:05$/);
    const phrases = within(within(drawer()).getByRole("list", { name: "Hedge phrases" })).getAllByRole("listitem");
    expect(phrases.map((li) => li.textContent)).toEqual(["“I think”2"]);
  });

  it("shows Fluency's counts with the discourse fillers included, and a bar for each filler word", async () => {
    renderCards();
    await userEvent.click(card(/^Fluency/));

    expect(stat("Fillers")).toHaveTextContent(/^7$/); // 5 measured + 2 "you know"
    expect(stat("Per minute")).toHaveTextContent(/^7$/);
    expect(stat("Duration")).toHaveTextContent(/^1:05$/);
    const words = within(within(drawer()).getByRole("list", { name: "Filler words" })).getAllByRole("listitem");
    expect(words.map((li) => li.textContent)).toEqual(["“um”3", "“uh”2", "“you know”2"]);
  });

  it("shows Clarity's clarity and the flagged words", async () => {
    renderCards();
    await userEvent.click(card(/^Clarity/));

    expect(stat("Clarity")).toHaveTextContent(/^96%$/);
    expect(stat("Flagged words")).toHaveTextContent(/^1$/);
    expect(within(within(drawer()).getByRole("list", { name: "Flagged words" })).getByText("quixotic")).toBeInTheDocument();
  });

  it("shows Rhythm's average WPM, standard deviation and range", async () => {
    renderCards();
    await userEvent.click(card(/^Rhythm/));

    expect(stat("Average WPM")).toHaveTextContent(/^170$/);
    expect(stat("Standard deviation")).toHaveTextContent(/^±20 WPM$/);
    expect(stat("Range")).toHaveTextContent(/^130–211 WPM$/);
  });

  it("shows the pace label, the three WPM scales and both pace charts in the Rhythm drawer", async () => {
    renderCards();
    await userEvent.click(card(/^Rhythm/));
    const open = within(drawer());

    expect(open.getByText("Slow", { selector: ".chip" })).toBeInTheDocument();
    expect(open.getByRole("img", { name: "Active WPM: 172, Slow" })).toBeInTheDocument();
    expect(open.getByRole("img", { name: "Baseline WPM: 181, Ideal" })).toHaveAccessibleDescription(
      /middle half of your fluent stretches was between 164 and 200 WPM/,
    );
    expect(open.getByRole("img", { name: "Overall WPM: 142, Ideal" })).toBeInTheDocument();
    expect(open.getByRole("img", { name: "WPM over time" })).toHaveAccessibleDescription(
      /between 130 and 211 WPM.*3 windows/,
    );
    expect(open.getByRole("img", { name: "Pace variation" })).toHaveAccessibleDescription(
      /4 stretches of speech.*1 rush zone.*no drag zones/,
    );
  });

  it("has only the measured dimensions, without feedback, for an assessment from before judging", async () => {
    const measuredOnly = { structure: null, conciseness: null, confidence: null, pronunciation: 133, fillerRate: 120, pace: 89 };
    render(<DimensionCards scores={measuredOnly} measured={measured} durationSeconds={65} />);

    expect(screen.queryByRole("button", { name: /^Shape/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What you said" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Clarity133/150",
      "Fluency120/150",
      "Rhythm89/100",
    ]);

    await userEvent.click(card(/^Rhythm/));

    const subScores = within(within(drawer()).getByRole("list", { name: "Scoring breakdown" })).getAllByRole("listitem");
    expect(subScores[0]).toHaveTextContent("Pause timing50/50");
    expect(subScores[1]).toHaveTextContent("Words per minute39/50");
    expect(within(drawer()).queryByRole("button", { name: "View feedback" })).not.toBeInTheDocument();
  });
});
