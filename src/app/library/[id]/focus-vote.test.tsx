// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ setFocusVote: vi.fn() }));

import { setFocusVote } from "@/app/actions";
import { FocusVoteToggles } from "./focus-vote";

beforeEach(() => vi.mocked(setFocusVote).mockReset().mockResolvedValue({ saved: true }));

const toggles = () => {
  const group = screen.getByRole("group", { name: "Cut the hedges" });
  return {
    up: within(group).getByRole("button", { name: "I want to work on this" }),
    down: within(group).getByRole("button", { name: "Not useful" }),
  };
};

describe("FocusVoteToggles", () => {
  it("reflects the stored vote", () => {
    render(<FocusVoteToggles recordingId="rec-1" area="Cut the hedges" vote="down" />);

    expect(toggles().up).toHaveAttribute("aria-pressed", "false");
    expect(toggles().down).toHaveAttribute("aria-pressed", "true");
  });

  it("votes, changes the vote, and clears it on a second click", async () => {
    const user = userEvent.setup();
    render(<FocusVoteToggles recordingId="rec-1" area="Cut the hedges" vote={null} />);
    expect(toggles().up).toHaveAttribute("aria-pressed", "false");

    await user.click(toggles().up);
    expect(toggles().up).toHaveAttribute("aria-pressed", "true");
    expect(setFocusVote).toHaveBeenLastCalledWith("rec-1", "Cut the hedges", "up");

    await user.click(toggles().down);
    expect(toggles().up).toHaveAttribute("aria-pressed", "false");
    expect(toggles().down).toHaveAttribute("aria-pressed", "true");
    expect(setFocusVote).toHaveBeenLastCalledWith("rec-1", "Cut the hedges", "down");

    await user.click(toggles().down);
    expect(toggles().down).toHaveAttribute("aria-pressed", "false");
    expect(setFocusVote).toHaveBeenLastCalledWith("rec-1", "Cut the hedges", null);
  });

  it("goes back to the stored vote and says so when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(setFocusVote).mockResolvedValue({ error: "That vote couldn't be saved." });
    render(<FocusVoteToggles recordingId="rec-1" area="Cut the hedges" vote="up" />);

    await user.click(toggles().down);

    expect(toggles().up).toHaveAttribute("aria-pressed", "true");
    expect(toggles().down).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("alert")).toHaveTextContent("Your vote wasn't saved");
  });
});
