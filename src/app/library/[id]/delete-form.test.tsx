// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({ deleteRecording: vi.fn() }));

import { deleteRecording } from "@/app/actions";
import { DeleteForm } from "./delete-form";

beforeEach(() => vi.mocked(deleteRecording).mockReset());

describe("DeleteForm", () => {
  it("asks for confirmation and deletes when confirmed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<DeleteForm recordingId="rec-1" />);

    await user.click(screen.getByRole("button", { name: "Delete recording" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("permanently removes the video and your ratings"));
    expect(deleteRecording).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteRecording).mock.calls[0][0].get("recordingId")).toBe("rec-1");
  });

  it("does nothing when the user cancels", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<DeleteForm recordingId="rec-1" />);

    await user.click(screen.getByRole("button", { name: "Delete recording" }));

    expect(deleteRecording).not.toHaveBeenCalled();
  });
});
