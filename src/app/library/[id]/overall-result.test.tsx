// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ setFocusVote: vi.fn() }));

import { OverallResult } from "./overall-result";

const props = {
  recordingId: "rec-1",
  overview: "A well-ordered answer that would land harder with a direct opening.",
  strengths: ["Clear example", "Strong close"],
  areasToImprove: ["Open with your point", "Cut the hedges"],
  focusVotes: { "Cut the hedges": "up" as const },
};

describe("OverallResult", () => {
  it("shows the overview under its heading", () => {
    render(<OverallResult {...props} />);

    expect(screen.getByRole("heading", { name: "Overview" }).nextElementSibling).toHaveTextContent(props.overview);
  });

  it("lists the strengths with ticks and the areas to improve", () => {
    render(<OverallResult {...props} />);

    const strengths = within(screen.getByRole("list", { name: "Strengths" })).getAllByRole("listitem");
    expect(strengths.map((li) => li.textContent)).toEqual(["✓Clear example", "✓Strong close"]);
    const areas = within(screen.getByRole("list", { name: "Areas to improve" })).getAllByRole("listitem");
    expect(areas.map((li) => li.firstChild?.textContent)).toEqual(["Open with your point", "Cut the hedges"]);
  });

  it("gives each area to improve its focus vote", () => {
    render(<OverallResult {...props} />);

    const vote = (area: string) =>
      within(screen.getByRole("group", { name: area })).getByRole("button", { name: "I want to work on this" });
    expect(vote("Cut the hedges")).toHaveAttribute("aria-pressed", "true");
    expect(vote("Open with your point")).toHaveAttribute("aria-pressed", "false");
  });
});
