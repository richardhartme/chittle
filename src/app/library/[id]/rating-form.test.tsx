// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordingRating } from "@/db/schema";

vi.mock("@/app/actions", () => ({ saveRating: vi.fn() }));

import { saveRating } from "@/app/actions";
import { RatingForm } from "./rating-form";

const CRITERIA = ["Clarity", "Confidence", "Structure", "Pacing", "Body language"];

beforeEach(() => vi.mocked(saveRating).mockReset());

/** Picks `value` in the radio group for `criterion`. */
const rate = (user: ReturnType<typeof userEvent.setup>, criterion: string, value: number) =>
  user.click(
    screen
      .getByText(criterion, { selector: "span" })
      .closest("fieldset")!
      .querySelector(`input[value="${value}"]`)!,
  );

async function rateAll(user: ReturnType<typeof userEvent.setup>, value = 4) {
  for (const criterion of CRITERIA) await rate(user, criterion, value);
}

describe("RatingForm", () => {
  it("renders five criteria with options 1 to 5 and a notes field", () => {
    render(<RatingForm recordingId="rec-1" initial={null} />);

    for (const criterion of CRITERIA) {
      const group = screen.getByText(criterion, { selector: "span" }).closest("fieldset")!;
      expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(5);
    }
    expect(screen.getByLabelText("Notes")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("pre-fills a previous rating", () => {
    const initial: RecordingRating = {
      recordingId: "rec-1",
      clarity: 1,
      confidence: 2,
      structure: 3,
      pacing: 4,
      bodyLanguage: 5,
      note: "Earlier note",
      updatedAt: new Date(),
    };
    render(<RatingForm recordingId="rec-1" initial={initial} />);

    expect(screen.getAllByRole("radio", { checked: true }).map((r) => (r as HTMLInputElement).value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(screen.getByLabelText("Notes")).toHaveValue("Earlier note");
  });

  it("submits every value along with the recording id", async () => {
    vi.mocked(saveRating).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<RatingForm recordingId="rec-1" initial={null} />);

    await rate(user, "Clarity", 5);
    await rate(user, "Confidence", 4);
    await rate(user, "Structure", 3);
    await rate(user, "Pacing", 2);
    await rate(user, "Body language", 1);
    await user.type(screen.getByLabelText("Notes"), "Slow down");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    const [prev, formData] = vi.mocked(saveRating).mock.calls[0];
    expect(prev).toBeUndefined();
    expect(Object.fromEntries(formData)).toEqual({
      recordingId: "rec-1",
      clarity: "5",
      confidence: "4",
      structure: "3",
      pacing: "2",
      bodyLanguage: "1",
      note: "Slow down",
    });
  });

  it("keeps what the user entered after saving", async () => {
    vi.mocked(saveRating).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<RatingForm recordingId="rec-1" initial={null} />);

    await rateAll(user, 4);
    await user.type(screen.getByLabelText("Notes"), "Keep me");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");

    expect(screen.getAllByRole("radio", { checked: true })).toHaveLength(5);
    expect(screen.getByLabelText("Notes")).toHaveValue("Keep me");
  });

  it("does not submit until every criterion is rated", async () => {
    const user = userEvent.setup();
    render(<RatingForm recordingId="rec-1" initial={null} />);

    await rate(user, "Clarity", 3);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(saveRating).not.toHaveBeenCalled();
  });

  it("shows a server error", async () => {
    vi.mocked(saveRating).mockResolvedValue({ error: "Recording not found." });
    const user = userEvent.setup();
    render(<RatingForm recordingId="rec-1" initial={null} />);

    await rateAll(user);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Recording not found.")).toBeInTheDocument();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("clears the 'Saved.' message when the user edits again", async () => {
    vi.mocked(saveRating).mockResolvedValue({ saved: true });
    const user = userEvent.setup();
    render(<RatingForm recordingId="rec-1" initial={null} />);
    await rateAll(user);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");

    await rate(user, "Pacing", 1);
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("Saved.");
    await user.type(screen.getByLabelText("Notes"), "x");
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });

  it("limits notes to 5000 characters", () => {
    render(<RatingForm recordingId="rec-1" initial={null} />);
    expect(screen.getByLabelText("Notes")).toHaveAttribute("maxlength", "5000");
  });
});
